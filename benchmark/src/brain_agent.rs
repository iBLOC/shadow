//! 大脑独立栈 A2A endpoint adapter (subject #1 of 2, see
//! docs/benchmark-positioning.md §0) — POST /a2a/tasks/send with
//! skill routing.
//!
//! Wire contract pinned from `telencephalon/src/api/a2a_gateway.rs` +
//! `a2a/skill_router.rs`: the skill is read from `message.metadata.skill`
//! (top-level `skill` also accepted) and routes to a registered lobe.
//! Response parsing handles the v0.1 task envelope the gateway returns
//! (`result.task.status.message`).

use crate::agent::{AgentAdapter, AgentError, AgentRun};
use crate::task::Task;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;

pub struct BrainAgent {
    pub name: String,
    /// Base URL of the brain's A2A endpoint, e.g. `http://127.0.0.1:8082`.
    pub a2a_base_url: String,
    /// Skill id the brain's router dispatches to. Sent both at the
    /// top level and inside `message.metadata.skill` (either backend
    /// shape routes).
    pub skill: String,
    /// Wall-clock budget for one task round-trip.
    pub timeout_secs: u64,
}

impl BrainAgent {
    fn extract_text(v: &Value) -> String {
        // A2A v0.1 task envelope, two shapes:
        //   a) gateway-unwrapped: {id, status:{state,message,...}} (what
        //      telencephalon a2a_gateway returns for tasks/send)
        //   b) raw lobe reply: {task: {status: {message}}}
        for envelope in [v, &v["task"]] {
            if let Some(msg) = envelope
                .get("status")
                .and_then(|s| s.get("message"))
                .and_then(|m| m.as_str())
            {
                return msg.to_string();
            }
        }
        // parts[].text (A2A Message) → text → content → whole body.
        if let Some(parts) = v.get("parts").and_then(|p| p.as_array()) {
            let texts: Vec<&str> = parts
                .iter()
                .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                .collect();
            if !texts.is_empty() {
                return texts.join("\n");
            }
        }
        for key in ["text", "content", "output", "result"] {
            if let Some(s) = v.get(key).and_then(|s| s.as_str()) {
                return s.to_string();
            }
        }
        serde_json::to_string(v).unwrap_or_default()
    }
}

#[async_trait]
impl AgentAdapter for BrainAgent {
    fn name(&self) -> &str {
        &self.name
    }

    async fn run(&self, task: &Task, _workdir: &Path, _prior_traces: &str) -> Result<AgentRun, AgentError> {
        let started = std::time::Instant::now();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(self.timeout_secs))
            .build()
            .map_err(|e| AgentError::Failed {
                agent: self.name.clone(),
                message: format!("http client: {e}"),
            })?;

        let url = format!("{}/a2a/tasks/send", self.a2a_base_url.trim_end_matches('/'));
        // Telencephalon gateway reads `message.metadata.skill`; synapse's
        // lobe server reads a top-level `skill` — send both.
        // `answer_contract` is appended so the lobe's system prompt
        // (or in our case the prefrontal v13 chat path) injects the
        // GAIA-style "FINAL ANSWER: <v>" contract the scorer expects.
        let mut text = task.instruction.clone();
        if !task.answer_contract.is_empty() {
            text.push_str("\n\n");
            text.push_str(&task.answer_contract);
        }
        let body = json!({
            "skill": self.skill,
            "message": {
                "role": "user",
                "parts": [{"type": "Text", "text": text}],
                "metadata": {"skill": self.skill},
            },
        });
        let resp = client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| AgentError::Failed {
                agent: self.name.clone(),
                message: format!("a2a send: {e}"),
            })?;
        let status = resp.status();
        let payload: Value = resp.json().await.map_err(|e| AgentError::Failed {
            agent: self.name.clone(),
            message: format!("a2a response not JSON ({}): {e}", status),
        })?;

        if let Some(err) = payload.get("error") {
            return Err(AgentError::Failed {
                agent: self.name.clone(),
                message: format!(
                    "brain a2a error {}: {}",
                    err.get("code").and_then(|c| c.as_i64()).unwrap_or(0),
                    err.get("message").and_then(|m| m.as_str()).unwrap_or("?")
                ),
            });
        }

        Ok(AgentRun {
            answer: Self::extract_text(&payload),
            duration: started.elapsed(),
            exit_code: Some(0),
            usage: crate::agent::TokenUsage::default(),
            tool_calls: 0,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::task::ScorerSpec;

    fn task(instruction: &str) -> Task {
        Task {
            id: "t1".into(),
                framework: None,
            instruction: instruction.into(),
            files: vec![],
            answer_contract: String::new(),
            hidden_files: vec![],
            scorer: ScorerSpec::ExactMatch {
                expected: String::new(),
                case_sensitive: false,
            },
            timeout_secs: None,
        }
    }

    #[test]
    fn extract_text_reads_v01_task_envelope() {
        let v = serde_json::json!({
            "id": "x",
            "status": {"state": "COMPLETED", "message": "⚠️ 浴缸水温 27.3°C", "timestamp": 1},
        });
        assert_eq!(BrainAgent::extract_text(&v), "⚠️ 浴缸水温 27.3°C");
    }

    #[test]
    fn extract_text_falls_back_to_parts_then_body() {
        let v = serde_json::json!({"parts": [{"type": "Text", "text": "hello"}]});
        assert_eq!(BrainAgent::extract_text(&v), "hello");
        let v = serde_json::json!({"unknown": {"nested": true}});
        let s = BrainAgent::extract_text(&v);
        assert!(s.contains("nested"));
    }
}
