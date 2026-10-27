//! Scorers — judge an [`AgentRun`] against a task's [`ScorerSpec`].

use crate::agent::OpenAiAgent;
use crate::task::{ScorerSpec, Task};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct Score {
    pub passed: bool,
    pub detail: String,
}

/// Collapse whitespace and (optionally) case so that "  391\n" == "391"
/// and "One,  Two" == "one, two" compare equal.
pub fn normalize(s: &str, case_sensitive: bool) -> String {
    let collapsed = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if case_sensitive {
        collapsed
    } else {
        collapsed.to_lowercase()
    }
}

/// Detect the "I did X but I didn't actually have a tool" pattern.
///
/// Some prompt-only LLM backends (e.g. the bench harness's `openai`
/// adapter against `api.deepseek.com` with no `tools=` field) answer
/// tool-action tasks by **narrating** the action — "I wrote DELTA-042
/// to pf-delta/secret.txt" — when no tool call actually happened. The
/// scorer rewards the answer if the narrated content happens to
/// contain the expected value (e.g. "DELTA-042"), which is a false
/// positive: a real test of the harness would have to verify the
/// file exists on disk, not just that the model claims to have
/// written it.
///
/// The heuristic: if the answer narrates a tool-style action
/// ("I wrote ...", "I created ...", "the file is at ...", etc.) and
/// the `answer` is verbose enough to be a real claim (more than 60
/// chars after the marker line is stripped) AND there's no tool-call
/// evidence in the response, flag the answer as a hallucinated
/// action. Return value is the matched phrase when detected, so
/// callers can include it in the score detail.
///
/// Detection is intentionally narrow: it only fires on English
/// action-claim patterns. Bare assertions ("DELTA-042") and
/// prose-style answers (e.g. the GAIA reasoning chain) pass through.
pub fn detect_hallucinated_action(answer: &str) -> Option<&'static str> {
    // Full Unicode lowercase (not ascii_lowercase) so Cyrillic
    // ("Я создал" → "я создал") and CJK action claims are
    // case-folded into the same pattern table.
    let lower = answer.to_lowercase();
    // Phrases that imply a real tool action. Order matters only for
    // the detail string (the first match wins).
    static PHRASES: &[&str] = &[
        "i wrote ",
        "i've written ",
        "i have written ",
        "i created ",
        "i created the file",
        "i saved ",
        "is now saved",
        "i read the file",
        "i read pf-delta",
        "i read it and",
        "i read the contents",
        "the file is at ",
        "the file is now at ",
        "i ran the command",
        "i executed ",
        "i successfully wrote",
        "i have created",
        "i'll create the file",
        "i will create the file",
        "i'll write to",
        "i will write to",
        "tools i have access to are",
        "我的 file_write",
        "已写入",
        // JSON tool-call formats (Anthropic-style `<tool_call>`,
        // Mistral/Mixtral `<tool_call>`, OpenAI function_call) —
        // models that "fake" a tool invocation by emitting
        // structured JSON in plain text instead of going through
        // the wire tool loop. Common in prompt-only LLM backends
        // when the model "thinks" it has a tool surface but
        // actually doesn't.
        "{\"name\": \"file_",
        "{\"name\":\"file_",
        "{\"tool\": \"file_",
        "{\"tool\":\"file_",
        "{\"function\": \"file_",
        "{\"function\":\"file_",
        "function_call\":",
        "tool_call\":",
        "\"name\": \"shell",
        "{\"name\":\"shell",
        "\"arguments\": {\"path\":",
        "\"arguments\":{\"path\":",
        "\"file_write\"",
        "\"file_read\"",
        "\"shell_cmd\"",
        // Multi-lingual action claims. Models trained on
        // non-English data (CJK / Romance / Germanic / Slavic)
        // often narrate actions in their training language
        // rather than English. Only the most distinctive tokens
        // are listed; false-positive cost is low because the
        // guard is scoped to file-* / shell-* tasks.
        // Japanese
        "ファイルを書き",     // file wo kaita (wrote file)
        "ファイルを読み",     // file wo yonda (read file)
        "ファイルを作成",     // file wo sakusei (created file)
        "保存しました",       // hozon shimashita (saved)
        "実行しました",       // jikko shimashita (executed)
        // Korean
        "파일을 작성",        // wrote file
        "파일을 읽",          // read file
        "파일을 만들",        // created file
        "저장했",             // saved
        "실행했",             // executed
        // French
        "j'ai écrit ",
        "j'ai créé ",
        "j'ai lu ",
        "j'ai enregistré ",
        "fichier créé",
        "fichier enregistré",
        // German
        "ich habe die datei ",
        "ich habe geschrieben",
        "ich habe erstellt",
        "ich habe gelesen",
        "datei erstellt",
        "datei geschrieben",
        // Spanish
        "he escrito ",
        "he creado ",
        "he leído ",
        "archivo creado",
        "archivo guardado",
        // Portuguese
        "eu escrevi ",
        "eu criei ",
        "eu li ",
        "arquivo criado",
        "arquivo salvo",
        // Russian
        "я записал ",         // recorded/wrote
        "я создал ",          // created
        "я прочитал ",        // read
        "файл создан",        // file created
        "файл сохранён",      // file saved
    ];
    for phrase in PHRASES {
        if lower.contains(phrase) {
            // The narration is real only if the answer is more than
            // a one-liner — a short answer can't actually narrate
            // an action. The threshold is intentionally low (30
            // chars) so JSON tool-call formats (compact by design)
            // still trigger; we don't need verbosity as a
            // discriminator, the phrase match already is.
            if answer.len() > 30 {
                return Some(phrase);
            }
        }
    }
    None
}

/// Remove `<think>...</think>` reasoning blocks from an answer.
/// Qwen3-family models stream their chain-of-thought before the real
/// answer even with the /no_think soft switch; the think text is not
/// part of the answer contract and must not fail exact-match scoring.
/// An unclosed `<think>` drops everything after the opener.
pub fn strip_think(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    loop {
        match rest.find("<think>") {
            Some(start) => {
                out.push_str(&rest[..start]);
                match rest[start..].find("</think>") {
                    Some(end) => {
                        let close = start + end + "</think>".len();
                        rest = &rest[close..];
                    }
                    None => {
                        rest = "";
                    }
                }
            }
            None => {
                out.push_str(rest);
                break;
            }
        }
    }
    out
}

pub async fn score(
    spec: &ScorerSpec,
    task: &Task,
    workdir: &Path,
    answer: &str,
    judge: Option<&OpenAiAgent>,
) -> Score {
    let answer = &strip_think(answer);

    // Hallucinated-action guard: prompt-only LLM agents (e.g. the
    // bench's direct-OpenAI adapter) sometimes narrate a tool
    // action instead of actually performing it. The scorer would
    // otherwise reward the narration when it happens to contain the
    // expected value. Tasks whose id signals a file-action requirement
    // (e.g. `file-write-secret`, `file-read-secret`,
    // `file-roundtrip-verified`) trip this guard; the guard fails the
    // task with a clear detail. Tasks whose score already accounts
    // for non-action answers (e.g. GAIA's prose reasoning) are
    // unaffected because the guard only fires for tool-action task
    // ids.
    if is_tool_action_task(&task.id) {
        if let Some(phrase) = detect_hallucinated_action(answer) {
            return Score {
                passed: false,
                detail: format!(
                    "hallucinated action: answer narrates '{phrase}' but no tool call was made"
                ),
            }
            .tap_task(task);
        }
    }
    match spec {
        ScorerSpec::ExactMatch {
            expected,
            case_sensitive,
        } => {
            let (a, e) = (
                normalize(answer, *case_sensitive),
                normalize(expected, *case_sensitive),
            );
            let mut passed = a == e;
            let mut why = "exact match".to_string();
            if !passed {
                // Fallbacks for answers that carry the harness's own
                // FINAL ANSWER contract or number formatting. Strictly
                // F→P: only tried after the raw comparison failed.
                // 1. Marker strip on a single line (caller preserved
                //    case so case_sensitive suites still work).
                if let Some(pos) = answer.to_lowercase().rfind("final answer:") {
                    let rest = &answer[pos + "final answer:".len()..];
                    let cand = normalize(rest.lines().next().unwrap_or("").trim(), *case_sensitive);
                    if cand == e {
                        passed = true;
                        why = "exact match (FINAL ANSWER marker stripped)".into();
                    }
                }
                // 2. Numeric equality ("1280.00" == "1280") — same
                //    leniency official extract-and-compare harnesses
                //    use. Tried on both raw answer and the marker
                //    candidate so "final answer: 1280.00" composes.
                if !passed {
                    let mut cands: [&str; 2] = [a.as_str(), ""];
                    if let Some(pos) = answer.to_lowercase().rfind("final answer:") {
                        cands[1] = answer[pos + "final answer:".len()..]
                            .lines()
                            .next()
                            .unwrap_or("")
                            .trim();
                    }
                    if cands.iter().any(|c| match (c.parse::<f64>(), e.parse::<f64>()) {
                        (Ok(x), Ok(y)) => (x - y).abs() <= 1e-9 + 1e-6 * y.abs(),
                        _ => false,
                    }) {
                        passed = true;
                        why = "exact match (numeric equality)".into();
                    }
                }
            }
            Score {
                passed,
                detail: if passed {
                    why
                } else {
                    format!("expected {e:?}, got {a:?}")
                },
            }
        }
        ScorerSpec::Contains { all_of, any_of } => {
            let a = normalize(answer, false);
            let mut missing: Vec<String> = all_of
                .iter()
                .filter(|p| !a.contains(&normalize(p, false)))
                .cloned()
                .collect();
            if !any_of.is_empty()
                && !any_of.iter().any(|p| a.contains(&normalize(p, false)))
            {
                missing.push(format!("any of {any_of:?}"));
            }
            if missing.is_empty() {
                Score {
                    passed: true,
                    detail: "contains all markers".into(),
                }
            } else {
                Score {
                    passed: false,
                    detail: format!("missing: {missing:?}"),
                }
            }
        }
        ScorerSpec::UnitTests { command } => {
            let Some((program, rest)) = command.split_first() else {
                return Score {
                    passed: false,
                    detail: "empty unit-test command".into(),
                };
            };
            let output = tokio::process::Command::new(program)
                .args(rest)
                .current_dir(workdir)
                .output()
                .await;
            match output {
                Ok(out) => {
                    let passed = out.status.success();
                    let mut tail = String::from_utf8_lossy(&out.stdout).to_string();
                    tail.push_str(&String::from_utf8_lossy(&out.stderr));
                    let tail: String = {
                        let s = tail.trim();
                        if s.len() > 1500 {
                            format!("…{}", &s[s.len() - 1500..])
                        } else {
                            s.to_string()
                        }
                    };
                    Score {
                        passed,
                        detail: if passed {
                            "tests passed".into()
                        } else {
                            format!(
                                "exit {:?}\n{}",
                                out.status.code(),
                                tail
                            )
                        },
                    }
                }
                Err(e) => Score {
                    passed: false,
                    detail: format!("test command failed to run: {e}"),
                },
            }
        }
        ScorerSpec::LlmJudge { rubric } => {
            let Some(judge) = judge else {
                return Score {
                    passed: false,
                    detail: "no judge configured (set [judge] in agents.toml)".into(),
                };
            };
            let prompt = format!(
                "You are a strict benchmark judge. Score the candidate answer.\n\
                 RUBRIC:\n{rubric}\n\nTASK INSTRUCTION:\n{}\n\nCANDIDATE ANSWER:\n{answer}\n\n\
                 Reply with ONLY a JSON object: {{\"pass\": true|false, \"reason\": \"...\"}}",
                task.instruction
            );
            let judge_task = crate::task::Task {
                id: format!("judge-{}", task.id),
                framework: None,
                instruction: prompt,
                files: vec![],
                answer_contract: String::new(),
                hidden_files: vec![],
                scorer: ScorerSpec::Contains {
                    all_of: vec![],
                    any_of: vec![],
                },
                timeout_secs: task.timeout_secs,
            };
            match crate::agent::AgentAdapter::run(judge, &judge_task, workdir, "").await {
                Ok(run) => match parse_judge_json(&run.answer) {
                    Some(parsed) => Score {
                        passed: parsed.pass,
                        detail: parsed.reason,
                    },
                    None => Score {
                        passed: false,
                        detail: format!("judge did not return JSON: {}", run.answer),
                    },
                },
                Err(e) => Score {
                    passed: false,
                    detail: format!("judge call failed: {e}"),
                },
            }
        }
        ScorerSpec::GaiaMatch { expected } => {
            let passed = gaia_matches(&expected, answer);
            let detail = if passed {
                "gaia match (number / list / normalized-string)".to_string()
            } else {
                let cand = extract_final_answer(answer);
                format!("expected {expected:?} (normalized), got answer={answer:?} candidate={cand:?}")
            };
            Score { passed, detail }
        }
    }
    .tap_task(task)
}

/// GAIA-style answer match: official `question_scorer` semantics ported
/// to the local harness.
///
/// 1. **Number** — if both sides parse as `f64`, compare with abs/rel
///    tolerance (mirrors the `math.isclose` style of the official
///    scorer; a small slack prevents float-format edge cases from
///    failing a clearly-correct answer).
/// 2. **Comma-separated list** — split on `,`, strip, compare as
///    sets (order-insensitive). The "set, not list" choice matches
///    the official scorer for multi-value GAIA questions (zip codes
///    appearing in any order should all pass).
/// 3. **Normalised string** — strip, collapse whitespace, lowercase,
///    remove leading articles ("a ", "an ", "the "), remove
///    punctuation (`. , ! ? : ; ' "`); then exact equality.
///
/// The candidate answer is taken from the **last** `FINAL ANSWER:`
/// marker line when present; else the whole answer. This matches
/// the harness's `answer_contract` injection (GAIA suite appends
/// it via `Task.answer_contract`).
pub fn gaia_matches(expected: &str, answer: &str) -> bool {
    let cand = extract_final_answer(answer);
    let cand = cand.trim();
    let expected = expected.trim();
    if cand.is_empty() || expected.is_empty() {
        return cand == expected;
    }
    // Number path — both parse strictly.
    if let (Ok(e), Ok(c)) = (expected.parse::<f64>(), cand.parse::<f64>()) {
        let tol = 1e-9 + 1e-6 * e.abs();
        return (c - e).abs() <= tol;
    }
    // Comma list path — only when both contain a comma (avoid false
    // positives on prose answers that happen to include a comma).
    if expected.contains(',') && cand.contains(',') {
        let e_norm: std::collections::BTreeSet<String> = expected
            .split(',')
            .map(|s| normalize_string_item(s))
            .collect();
        let c_norm: std::collections::BTreeSet<String> = cand
            .split(',')
            .map(|s| normalize_string_item(s))
            .collect();
        if e_norm == c_norm && !e_norm.is_empty() {
            return true;
        }
    }
    // Normalised string path.
    normalize_string_item(expected) == normalize_string_item(cand)
}

/// Pull the answer out of the model's response. Strategy:
/// 1. First `FINAL ANSWER: <value>` line (the harness's GAIA contract).
/// 2. **Last short non-empty line** (≤ 80 chars, doesn't end in `.`)
///    as a fallback — covers the common case where the LLM outputs
///    reasoning followed by a short answer on the final line.
/// 3. Whole answer.
pub fn extract_final_answer(answer: &str) -> String {
    for line in answer.lines() {
        let lower = line.to_ascii_lowercase();
        if let Some(pos) = lower.find("final answer:") {
            return line[pos + "final answer:".len()..].trim().to_string();
        }
    }
    for line in answer.lines().rev() {
        let t = line.trim();
        if t.is_empty() || t.len() > 80 || t.ends_with('.') {
            continue;
        }
        return t.to_string();
    }
    answer.to_string()
}

fn normalize_string_item(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = false;
    for ch in s.chars() {
        if ch.is_alphanumeric() || ch.is_whitespace() {
            if ch.is_whitespace() {
                if !prev_space {
                    out.push(' ');
                }
                prev_space = true;
            } else {
                out.extend(ch.to_lowercase());
                prev_space = false;
            }
        }
        // punctuation / apostrophes / quotes are dropped
    }
    let trimmed = out.trim();
    // strip leading article for natural-language GAIA answers
    for art in ["a ", "an ", "the "] {
        if let Some(rest) = trimmed.strip_prefix(art) {
            return rest.to_string();
        }
    }
    trimmed.to_string()
}

/// Tasks whose id signals a real tool action is required (e.g. the
/// model is supposed to use `file_write` / `file_read` / `shell`,
/// not just answer in prose). The hallucination guard fails these
/// when the model narrates the action instead of taking it.
///
/// Public so the runner can apply the same predicate to the
/// disk-side post-score check (`verify_action_on_disk`).
pub fn is_tool_action_task(task_id: &str) -> bool {
    let id = task_id.to_ascii_lowercase();
    id.starts_with("file-")
        || id.starts_with("shell-")
        || id.contains("file_write")
        || id.contains("file_read")
        || id.contains("file_list")
        || id.contains("shell_")
}

/// Pull the gold answer markers out of a `ScorerSpec`. Used by the
/// disk-side content check (`verify_action_on_disk`) to confirm
/// that any file the agent created actually contains the expected
/// value (not just exists at the right path). For variants that
/// don't carry a textual gold (e.g. `UnitTests` and `LlmJudge`),
/// the returned vector is empty and the caller should skip the
/// content check.
pub fn extract_gold(spec: &ScorerSpec) -> Vec<String> {
    match spec {
        ScorerSpec::ExactMatch { expected, .. } => vec![expected.clone()],
        ScorerSpec::Contains { all_of, any_of } => {
            let mut g = all_of.clone();
            g.extend(any_of.iter().cloned());
            g
        }
        ScorerSpec::GaiaMatch { expected } => vec![expected.clone()],
        ScorerSpec::UnitTests { .. } | ScorerSpec::LlmJudge { .. } => Vec::new(),
    }
}

/// Trivial helper keeping the match arms tidy (identity).
trait TapTask {
    fn tap_task(self, task: &Task) -> Score;
}
impl TapTask for Score {
    fn tap_task(self, _task: &Task) -> Score {
        self
    }
}

#[derive(Debug)]
struct ParsedJudge {
    pass: bool,
    reason: String,
}

/// The judge model may wrap its JSON in prose or fences — take the
/// first object that looks like the contract.
fn parse_judge_json(answer: &str) -> Option<ParsedJudge> {
    let bytes = answer.as_bytes();
    let mut start = None;
    for (i, b) in bytes.iter().enumerate() {
        if *b == b'{' {
            start = Some(i);
            break;
        }
    }
    let start = start?;
    let mut depth = 0usize;
    for (i, b) in bytes[start..].iter().enumerate() {
        match b {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    let slice = &answer[start..start + i + 1];
                    let v: serde_json::Value = serde_json::from_str(slice).ok()?;
                    return Some(ParsedJudge {
                        pass: v.get("pass")?.as_bool()?,
                        reason: v
                            .get("reason")
                            .and_then(|r| r.as_str())
                            .unwrap_or("")
                            .to_string(),
                    });
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn exact_match_normalizes() {
        let task = Task {
            id: "t".into(),
                framework: None,
            instruction: "q".into(),
            files: vec![],
            answer_contract: String::new(),
            hidden_files: vec![],
            scorer: ScorerSpec::ExactMatch {
                expected: "391".into(),
                case_sensitive: false,
            },
            timeout_secs: None,
        };
        let s = score(&task.scorer, &task, Path::new("."), "  391 \n", None).await;
        assert!(s.passed);
        let s = score(&task.scorer, &task, Path::new("."), "392", None).await;
        assert!(!s.passed);
    }

    /// F→P fallback: lowercase "final answer: <value>" answer text
    /// passes the raw comparison (the harness's FINAL ANSWER contract).
    /// Caught encephalon-qwen06's "final answer: 90" output style on
    /// core-smoke rate-problem (2026-10-14).
    #[tokio::test]
    async fn exact_match_strips_lowercase_final_answer_marker() {
        let task = Task {
            id: "t".into(),
                framework: None,
            instruction: "q".into(),
            files: vec![],
            answer_contract: String::new(),
            hidden_files: vec![],
            scorer: ScorerSpec::ExactMatch {
                expected: "90".into(),
                case_sensitive: false,
            },
            timeout_secs: None,
        };
        let s = score(&task.scorer, &task, Path::new("."), "final answer: 90", None).await;
        assert!(s.passed, "{:?}", s.detail);
        // Wrong value must still fail (fallback is strictly F→P).
        let s = score(&task.scorer, &task, Path::new("."), "final answer: 91", None).await;
        assert!(!s.passed);
    }

    /// F→P fallback: "1280.00" vs "1280" — small float delta, official
    /// harnesses treat them as equal. Originally surfaced by
    /// encephalon-qwen06's core-smoke extraction task (2026-10-14).
    #[tokio::test]
    async fn exact_match_numeric_equality_fallback() {
        let task = Task {
            id: "t".into(),
                framework: None,
            instruction: "q".into(),
            files: vec![],
            answer_contract: String::new(),
            hidden_files: vec![],
            scorer: ScorerSpec::ExactMatch {
                expected: "1280".into(),
                case_sensitive: false,
            },
            timeout_secs: None,
        };
        let s = score(&task.scorer, &task, Path::new("."), "1280.00", None).await;
        assert!(s.passed, "{:?}", s.detail);
        // The two fallbacks compose: marker + numeric.
        let s = score(&task.scorer, &task, Path::new("."), "final answer: 1280.00", None).await;
        assert!(s.passed, "{:?}", s.detail);
        // Wrong value stays failed.
        let s = score(&task.scorer, &task, Path::new("."), "640.00", None).await;
        assert!(!s.passed);
    }

    #[test]
    fn judge_json_lenient() {
        let p = parse_judge_json("Sure! {\"pass\": true, \"reason\": \"ok\"} — done").unwrap();
        assert!(p.pass);
        assert_eq!(p.reason, "ok");
    }
}

#[cfg(test)]
mod strip_tests {
    use super::strip_think;

    #[test]
    fn strips_closed_block() {
        assert_eq!(strip_think("<think> hmm </think>391"), "391");
    }

    #[test]
    fn strips_unclosed_block() {
        assert_eq!(strip_think("<think> rambling forever"), "");
    }

    #[test]
    fn keeps_plain_answers() {
        assert_eq!(strip_think("391"), "391");
        assert_eq!(
            strip_think("<think>\n\n</think>\n\nOK"),
            "\n\nOK"
        );
    }
}

#[cfg(test)]
mod gaia_match_tests {
    use super::{extract_final_answer, gaia_matches};

    #[test]
    fn number_exact() {
        assert!(gaia_matches("42", "42"));
        assert!(gaia_matches("42", "FINAL ANSWER: 42"));
    }

    #[test]
    fn number_close_enough() {
        // float formatting with trailing zeros + tiny slack
        assert!(gaia_matches("1280.00", "1280"));
        assert!(gaia_matches("0.1", "0.100000001")); // well within tolerance
        assert!(!gaia_matches("3.14", "3.14159")); // 0.5% diff exceeds
    }

    #[test]
    fn list_set_match() {
        assert!(gaia_matches("10001, 10002, 10003", "10003, 10002, 10001"));
        assert!(gaia_matches(
            "10001,10002",
            "FINAL ANSWER: 10001, 10002"
        ));
    }

    #[test]
    fn list_partial_fails() {
        // missing element
        assert!(!gaia_matches("10001, 10002, 10003", "10001, 10002"));
    }

    #[test]
    fn string_normalized() {
        assert!(gaia_matches("egalitarian", "Egalitarian"));
        assert!(gaia_matches("a red bird", "the red bird"));
        // accented chars are alphanumeric — `to_lowercase` folds them.
        // (ASCII lower-cased to ASCII lower-cased: not a match because
        // `côte` ≠ `cote` after lowercasing; that's the official
        // scorer's behaviour too — GAIA answers fold but they do
        // not transliterate.)
        assert!(!gaia_matches("Côte d'Azur", "cote dazur"));
        assert!(gaia_matches("Côte d'Azur", "Côte d'Azur"));
    }

    #[test]
    fn extracts_first_marker() {
        // Convention: the agent emits a single FINAL ANSWER: line
        // (the harness's answer_contract). We take the first one.
        assert_eq!(
            extract_final_answer("reasoning...\nFINAL ANSWER: 7\nor maybe bar"),
            "7"
        );
        assert_eq!(extract_final_answer("just a number 7"), "just a number 7");
    }

    #[test]
    fn extracts_last_short_line_fallback() {
        // When the model didn't follow the contract (common on
        // GAIA level 2/3), the last non-empty short line is the
        // closest "extract-and-compare" approximation.
        let prose = "Step 1: recall the paper.\n\
                     Step 2: identify the axis labels.\n\
                     egalitarian";
        assert_eq!(extract_final_answer(prose), "egalitarian");
        // long final line (reasoning continuation) is not picked
        let tail = "reasoning that keeps going and going and does not stop here\n\
                    egalitarian";
        assert_eq!(extract_final_answer(tail), "egalitarian");
        // line ending in `.` is treated as prose
        let dot = "We pick answer A.\nWe pick answer B.\nfinal answer: A";
        assert_eq!(extract_final_answer(dot), "A");
    }
}

#[cfg(test)]
mod hallucination_tests {
    use super::{detect_hallucinated_action, is_tool_action_task};

    #[test]
    fn flags_i_wrote() {
        let ans = "I wrote DELTA-042 to pf-delta/secret.txt using file_write. \
                   The content matches the requested payload exactly.";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn flags_i_read_narration() {
        let ans = "I read the file at pf-delta/secret.txt and the content is: \
                   DELTA-042. The secret was already there from the prior step.";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn does_not_flag_bare_answer() {
        // A short answer cannot narrate an action.
        assert!(detect_hallucinated_action("DELTA-042").is_none());
        assert!(detect_hallucinated_action("7").is_none());
        // A reasoning chain (no action claim) passes through.
        let reasoning = "Step 1: identify the paper. Step 2: read the axis labels. \
                         Step 3: cross-reference the August 2016 submission. \
                         The label is egalitarian.";
        assert!(detect_hallucinated_action(reasoning).is_none());
    }

    #[test]
    fn flags_json_tool_call_anthropic() {
        // Anthropic-style `<tool_call>` block with JSON body
        // naming file_write / file_read / shell. Common when
        // models trained on Claude data try to "call tools" in
        // plain text.
        let ans = "I'll read the file for you. <tool_call>{\"name\": \"file_read\", \
                   \"arguments\": {\"path\": \"pf-delta/secret.txt\"}}</tool_call>";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn flags_json_tool_call_openai() {
        // OpenAI function_call JSON (also emitted by some models
        // even without a real tool surface).
        let ans = "Sure, here you go: {\"function_call\": {\"name\": \"file_write\", \
                   \"arguments\": {\"path\": \"x.txt\", \"content\": \"hi\"}}}";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn flags_json_tool_call_compact() {
        // Same JSON without spaces (some tokenizers strip them).
        let ans = "{\"name\":\"file_write\",\"arguments\":{\"path\":\"x\"}}";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn flags_function_call_field() {
        // Generic {"function": "file_..."} style.
        let ans = "I'll use the function: {\"function\": \"file_read\", \"args\": {}}";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn does_not_flag_unrelated_json() {
        // JSON that doesn't name a tool action passes through.
        assert!(detect_hallucinated_action(
            "{\"value\": 42, \"name\": \"answer\"}"
        ).is_none());
        assert!(detect_hallucinated_action(
            "The answer is {\"x\": 1} as you can see in the data."
        ).is_none());
    }

    #[test]
    fn flags_japanese_action_claim() {
        // ファイルを書き (wrote file) — distinctive enough not to
        // false-positive on prose.
        let ans = "ファイルを書き終わりました。内容は DELTA-042 です。";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn flags_korean_action_claim() {
        let ans = "파일을 작성했습니다. 내용은 DELTA-042 입니다.";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn flags_french_action_claim() {
        let ans = "J'ai écrit le contenu dans le fichier pf-delta/secret.txt: DELTA-042.";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn flags_german_action_claim() {
        let ans = "Ich habe die Datei pf-delta/secret.txt erstellt mit Inhalt: DELTA-042.";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn flags_spanish_action_claim() {
        let ans = "He escrito el archivo pf-delta/secret.txt con el contenido: DELTA-042.";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn flags_russian_action_claim() {
        let ans = "Я создал файл pf-delta/secret.txt с содержимым: DELTA-042.";
        assert!(detect_hallucinated_action(ans).is_some());
    }

    #[test]
    fn tool_action_task_ids() {
        assert!(is_tool_action_task("file-write-secret"));
        assert!(is_tool_action_task("file-read-secret"));
        assert!(is_tool_action_task("file-roundtrip-verified"));
        assert!(is_tool_action_task("shell-pipeline"));
        // GAIA / toolloop / llm-smoke tasks are NOT tool-action
        // (they may use tools but the score isn't tied to disk).
        assert!(!is_tool_action_task("llm-arithmetic"));
        assert!(!is_tool_action_task("tool-time-today"));
        assert!(!is_tool_action_task("gaia-egalitarian"));
    }

    #[test]
    fn extract_gold_pulls_textual_markers() {
        use super::{extract_gold, ScorerSpec};
        let exact = ScorerSpec::ExactMatch {
            expected: "DELTA-042".into(),
            case_sensitive: false,
        };
        assert_eq!(extract_gold(&exact), vec!["DELTA-042"]);

        let contains = ScorerSpec::Contains {
            all_of: vec!["x".into()],
            any_of: vec!["y".into(), "z".into()],
        };
        assert_eq!(extract_gold(&contains), vec!["x", "y", "z"]);

        let gaia = ScorerSpec::GaiaMatch {
            expected: "egalitarian".into(),
        };
        assert_eq!(extract_gold(&gaia), vec!["egalitarian"]);

        // Variants without a textual gold (the runner skips the
        // content check for these).
        let unit = ScorerSpec::UnitTests {
            command: vec!["true".into()],
        };
        assert!(extract_gold(&unit).is_empty());
        let judge = ScorerSpec::LlmJudge {
            rubric: "...".into(),
        };
        assert!(extract_gold(&judge).is_empty());
    }
}
