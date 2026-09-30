//! Suite — a named set of tasks, loaded from JSON.

use crate::task::Task;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Suite {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub tasks: Vec<Task>,
}

#[derive(Debug, thiserror::Error)]
pub enum SuiteError {
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid suite: {0}")]
    Invalid(String),
}

impl Suite {
    pub fn load(path: &Path) -> Result<Self, SuiteError> {
        let raw = std::fs::read_to_string(path)?;
        let suite: Suite = serde_json::from_str(&raw)?;
        suite.validate()?;
        Ok(suite)
    }

    /// Parse from an inline JSON string (tests, embedding hosts).
    pub fn from_str(json: &str) -> Result<Self, SuiteError> {
        let suite: Suite = serde_json::from_str(json)?;
        suite.validate()?;
        Ok(suite)
    }

    /// Task ids must be unique — the report indexes by id.
    pub fn validate(&self) -> Result<(), SuiteError> {
        if self.tasks.is_empty() {
            return Err(SuiteError::Invalid(format!(
                "suite '{}' has no tasks",
                self.name
            )));
        }
        let mut seen = std::collections::HashSet::new();
        for t in &self.tasks {
            if !seen.insert(t.id.as_str()) {
                return Err(SuiteError::Invalid(format!("duplicate task id: {}", t.id)));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_validates() {
        let s = Suite::from_str(
            r#"{"name":"t","tasks":[
              {"id":"a","instruction":"hi","scorer":{"kind":"exact-match","expected":"hi"}}
            ]}"#,
        )
        .unwrap();
        assert_eq!(s.tasks.len(), 1);
    }

    #[test]
    fn rejects_duplicate_ids() {
        let err = Suite::from_str(
            r#"{"name":"t","tasks":[
              {"id":"a","instruction":"1","scorer":{"kind":"exact-match","expected":"x"}},
              {"id":"a","instruction":"2","scorer":{"kind":"exact-match","expected":"y"}}
            ]}"#,
        )
        .unwrap_err();
        assert!(err.to_string().contains("duplicate"));
    }
}
