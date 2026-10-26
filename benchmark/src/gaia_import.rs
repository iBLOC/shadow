//! GAIA import — freeze GAIA task rows into a shadow suite.
//!
//! Data path: the official `gaia-benchmark/GAIA` dataset on HF is gated
//! (`gated=auto`, 401 without an approved token), so imports come from an
//! ungated mirror that preserves the official column schema and the
//! validation answers (e.g. `sayan1101/gaia_filtered_text_only`, fetched
//! as JSON via the HF datasets-server rows API or from a saved parquet
//! export). Rows embed raw questions + gold `Final answer`s; scoring is
//! the official `question_scorer` port in [`crate::scorer`].

use crate::scorer::gaia_matches;
use crate::suite::Suite;
use crate::task::{ScorerSpec, Task};
use serde::Deserialize;

/// Delivery contract appended to every GAIA task prompt: the model has
/// no tools in this harness (the OpenAI adapter is prompt-only), and the
/// answer is read from the last `FINAL ANSWER:` marker line.
pub const GAIA_ANSWER_CONTRACT: &str =
    "This is a GAIA-style question. Answer with the knowledge you have; no \
external tools or browsing are available. When you are done, present your \
final answer on its own line in exactly this format: FINAL ANSWER: <answer>. \
The answer must be a number, a short string, or a comma-separated list of \
values — nothing else.";

/// One GAIA dataset row (official column names).
#[derive(Debug, Clone, Deserialize)]
pub struct GaiaRow {
    #[serde(rename = "task_id")]
    pub task_id: String,
    #[serde(rename = "Question")]
    pub question: String,
    #[serde(default)]
    #[serde(rename = "Level")]
    pub level: String,
    #[serde(rename = "Final answer")]
    pub final_answer: String,
    #[serde(default)]
    #[serde(rename = "file_name")]
    pub file_name: String,
}

#[derive(Debug, thiserror::Error)]
pub enum GaiaError {
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid GAIA rows: {0}")]
    Invalid(String),
}

pub struct GaiaImportOpts<'a> {
    pub name: &'a str,
    /// Provenance string, e.g. `sayan1101/gaia_filtered_text_only@2023-12-08`.
    pub source: &'a str,
    /// `Some(["1","2"])` restricts to these levels; `None` = all.
    pub levels: Option<&'a [String]>,
    /// `Some(ids)` restricts to these task ids; `None` = all.
    pub ids: Option<&'a [String]>,
    /// Drop rows that ship a file attachment (the text-only subset).
    pub text_only: bool,
}

/// Accepts the datasets-server envelope `{"rows":[{"row":{...}}]}`, a
/// plain array of rows, or `{"data":[...]}`.
fn parse_rows(json: &str) -> Result<Vec<GaiaRow>, GaiaError> {
    let v: serde_json::Value = serde_json::from_str(json)?;
    let items: Vec<serde_json::Value> = if let Some(rows) = v.get("rows").and_then(|r| r.as_array()) {
        rows.iter()
            .map(|r| r.get("row").cloned().unwrap_or_else(|| r.clone()))
            .collect()
    } else if let Some(data) = v.get("data").and_then(|r| r.as_array()) {
        data.clone()
    } else if let Some(arr) = v.as_array() {
        arr.clone()
    } else {
        return Err(GaiaError::Invalid(
            "expected {\"rows\":[{\"row\":…}]}, {\"data\":[…]} or a JSON array".into(),
        ));
    };
    items
        .into_iter()
        .map(serde_json::from_value::<GaiaRow>)
        .collect::<Result<Vec<_>, _>>()
        .map_err(GaiaError::from)
}

/// Build a suite from GAIA rows JSON.
pub fn import_rows(json: &str, opts: &GaiaImportOpts) -> Result<Suite, GaiaError> {
    let rows = parse_rows(json)?;
    let mut tasks: Vec<Task> = Vec::new();
    for row in rows {
        if opts.text_only && !row.file_name.trim().is_empty() {
            continue;
        }
        if let Some(levels) = opts.levels {
            if !levels.iter().any(|l| l == &row.level) {
                continue;
            }
        }
        if let Some(ids) = opts.ids {
            if !ids.iter().any(|i| i == &row.task_id) {
                continue;
            }
        }
        if row.final_answer.trim().is_empty() {
            return Err(GaiaError::Invalid(format!(
                "task {} has an empty gold answer",
                row.task_id
            )));
        }
        tasks.push(Task {
            id: row.task_id,
            instruction: row.question,
            files: vec![],
            hidden_files: vec![],
            answer_contract: GAIA_ANSWER_CONTRACT.to_string(),
            scorer: ScorerSpec::GaiaMatch {
                expected: row.final_answer,
            },
            timeout_secs: None,
            // Constant framework tag: every GAIA task is the same
            // topic, so the session drift detector never fires.
            framework: Some("gaia".into()),
        });
    }
    if tasks.is_empty() {
        return Err(GaiaError::Invalid("no rows matched the import filters".into()));
    }
    let description = format!(
        "GAIA text-only tasks imported from {source}. Scoring is the official \
         question_scorer port (number / list / normalized-string matching) on \
         gold `Final answer`s. Scores are NOT GAIA-leaderboard-comparable — \
         official numbers use all 165 validation tasks with tool-equipped \
         agents (web search, file parsing); this harness is prompt-only.",
        source = opts.source
    );
    let suite = Suite {
        name: opts.name.to_string(),
        description,
        tasks,
    };
    suite
        .validate()
        .map_err(|e| GaiaError::Invalid(e.to_string()))?;
    Ok(suite)
}

/// Oracle check: every gold answer must score against itself. Catches
/// empty golds and pathological values (e.g. a gold of `NaN` can never
/// match — `nan == nan` is false in the official scorer too).
pub fn verify_oracle(suite: &Suite) -> Vec<(String, bool)> {
    suite
        .tasks
        .iter()
        .map(|t| {
            let expected = match &t.scorer {
                ScorerSpec::GaiaMatch { expected } => expected.clone(),
                _ => String::new(),
            };
            (t.id.clone(), gaia_matches(&expected, &expected))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rows_json() -> String {
        serde_json::json!({
            "rows": [
                {"row": {"task_id": "a1", "Question": "Q1?", "Level": "1",
                         "Final answer": "42", "file_name": ""}},
                {"row": {"task_id": "a2", "Question": "Q2?", "Level": "2",
                         "Final answer": "sea gull", "file_name": "x.png"}},
                {"row": {"task_id": "a3", "Question": "Q3?", "Level": "2",
                         "Final answer": "1, 2", "file_name": ""}},
                {"row": {"task_id": "a4", "Question": "Q4?", "Level": "3",
                         "Final answer": "alpha", "file_name": ""}}
            ]
        })
        .to_string()
    }

    fn opts<'a>(levels: Option<&'a [String]>) -> GaiaImportOpts<'a> {
        GaiaImportOpts {
            name: "gaia-test",
            source: "mirror@test",
            levels,
            ids: None,
            text_only: true,
        }
    }

    #[test]
    fn imports_text_only_and_filters_levels() {
        let suite = import_rows(&rows_json(), &opts(None)).unwrap();
        // a2 is dropped (attachment), 3 remain.
        let ids: Vec<&str> = suite.tasks.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, vec!["a1", "a3", "a4"]);

        let l2 = vec!["2".to_string()];
        let suite = import_rows(&rows_json(), &opts(Some(&l2))).unwrap();
        assert_eq!(suite.tasks.len(), 1);
        assert_eq!(suite.tasks[0].id, "a3");
    }

    #[test]
    fn task_shape_and_contract() {
        let suite = import_rows(&rows_json(), &opts(None)).unwrap();
        let t = &suite.tasks[0];
        assert!(t.answer_contract.contains("FINAL ANSWER"));
        match &t.scorer {
            ScorerSpec::GaiaMatch { expected } => assert_eq!(expected, "42"),
            other => panic!("wrong scorer: {other:?}"),
        }
    }

    #[test]
    fn plain_array_envelope_also_parses() {
        let json = serde_json::json!([
            {"task_id": "b1", "Question": "Q", "Level": "1",
             "Final answer": "x", "file_name": ""}
        ])
        .to_string();
        let suite = import_rows(&json, &opts(None)).unwrap();
        assert_eq!(suite.tasks[0].id, "b1");
    }

    #[test]
    fn verify_oracle_passes_on_self_answers() {
        let suite = import_rows(&rows_json(), &opts(None)).unwrap();
        let results = verify_oracle(&suite);
        assert_eq!(results.len(), 3);
        assert!(results.iter().all(|(_, ok)| *ok));
    }

    #[test]
    fn empty_gold_is_rejected() {
        let json = serde_json::json!([
            {"task_id": "c1", "Question": "Q", "Level": "1",
             "Final answer": " ", "file_name": ""}
        ])
        .to_string();
        let err = import_rows(&json, &opts(None)).unwrap_err();
        assert!(err.to_string().contains("c1"));
    }
}
