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
    match spec {
        ScorerSpec::ExactMatch {
            expected,
            case_sensitive,
        } => {
            let (a, e) = (
                normalize(answer, *case_sensitive),
                normalize(expected, *case_sensitive),
            );
            let passed = a == e;
            Score {
                passed,
                detail: if passed {
                    "exact match".into()
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
                instruction: prompt,
                files: vec![],
                scorer: ScorerSpec::Contains {
                    all_of: vec![],
                    any_of: vec![],
                },
                timeout_secs: task.timeout_secs,
            };
            match crate::agent::AgentAdapter::run(judge, &judge_task, workdir).await {
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
    }
    .tap_task(task)
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
            instruction: "q".into(),
            files: vec![],
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
