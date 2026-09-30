//! Shadow-Desktop agent adapter — drives the **real Tauri app** through
//! its wdio WebDriver surface (the same one the e2e suite uses).
//!
//! This is functional testing disguised as a benchmark entry: the
//! instruction flows through the actual product stack — AppInitializer
//! guard, ConversationPage, the cortexClient bridge, the embedded
//! neuron — and the reply is read back from the rendered DOM. A
//! failure here is an app bug, not an engine statistic.
//!
//! Requires the app running with the wdio webdriver plugin
//! (`pnpm tauri dev` exposes it on :4445). Unreachable → reported as
//! skip so engine-only comparisons still run.

use crate::agent::{AgentAdapter, AgentError, AgentRun};
use crate::task::Task;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::Path;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

pub struct ShadowDesktopAgent {
    pub name: String,
    /// WebDriver endpoint of the running app (wdio plugin).
    pub webdriver_url: String,
    /// Base URL of the app's dev server.
    pub app_url: String,
    /// How long to wait for the streamed assistant reply.
    pub reply_timeout_secs: u64,
    session: Mutex<Option<String>>,
}

impl ShadowDesktopAgent {
    pub fn new(
        name: String,
        webdriver_url: String,
        app_url: String,
        reply_timeout_secs: u64,
    ) -> Self {
        Self {
            name,
            webdriver_url,
            app_url,
            reply_timeout_secs,
            session: Mutex::new(None),
        }
    }

    async fn wd(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value, AgentError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| AgentError::Failed {
                agent: self.name.clone(),
                message: e.to_string(),
            })?;
        let url = format!("{}{}", self.webdriver_url.trim_end_matches('/'), path);
        let mut req = client.request(
            reqwest::Method::from_bytes(method.as_bytes())
                .map_err(|e| AgentError::Failed { agent: self.name.clone(), message: e.to_string() })?,
            &url,
        );
        if let Some(b) = &body {
            req = req.json(b);
        }
        let resp = req.send().await.map_err(|e| AgentError::Failed {
            agent: self.name.clone(),
            message: format!("webdriver {method} {path}: {e}"),
        })?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| AgentError::Failed {
            agent: self.name.clone(),
            message: e.to_string(),
        })?;
        let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        if !status.is_success() {
            return Err(AgentError::Failed {
                agent: self.name.clone(),
                message: format!("webdriver {method} {path} -> {status}: {text}"),
            });
        }
        Ok(v["value"].clone())
    }

    async fn ensure_session(&self) -> Result<String, AgentError> {
        let mut guard = self.session.lock().await;
        if let Some(id) = guard.as_ref() {
            // Probe liveness; a dead session (app restarted) recreates.
            let probe = self
                .wd("GET", &format!("/session/{id}/url"), None)
                .await;
            if probe.is_ok() {
                return Ok(id.clone());
            }
            *guard = None;
        }
        let v = self
            .wd("POST", "/session", Some(json!({"capabilities": {}})))
            .await?;
        // Standard responses carry `sessionId` directly; the wdio plugin
        // variant nests it. Take the explicit field first, then scan
        // for any string-typed field defensively.
        let id = v
            .get("sessionId")
            .and_then(|x| x.as_str())
            .map(str::to_string)
            .or_else(|| {
                v.as_object().and_then(|o| {
                    o.values()
                        .find_map(|x| x.as_str().map(str::to_string))
                })
            })
            .ok_or_else(|| AgentError::Failed {
                agent: self.name.clone(),
                message: format!("no session id in response: {v}"),
            })?;
        *guard = Some(id.clone());
        Ok(id)
    }

    async fn find_element(&self, sid: &str, xpath: &str) -> Option<String> {
        let v = self
            .wd(
                "POST",
                &format!("/session/{sid}/element"),
                Some(json!({"using": "xpath", "value": xpath})),
            )
            .await
            .ok()?;
        v.as_object()
            .and_then(|o| {
                o.iter()
                    .find(|(k, _)| k.starts_with("element-"))
                    .map(|(_, v)| v.as_str().map(str::to_string))
            })
            .flatten()
    }

    async fn execute(&self, sid: &str, script: &str) -> Value {
        self.wd(
            "POST",
            &format!("/session/{sid}/execute/sync"),
            Some(json!({"script": script, "args": []})),
        )
        .await
        .unwrap_or(Value::Null)
    }

    async fn page_text(&self, sid: &str) -> String {
        let v = self
            .wd("GET", &format!("/session/{sid}/source"), None)
            .await
            .unwrap_or(Value::Null);
        let html = v.as_str().unwrap_or("");
        let body_start = html.find("<body").map(|i| html[i..].find('>').map(|j| i + j + 1)).flatten().unwrap_or(0);
        let body = &html[body_start..];
        // Tag-strip + whitespace collapse — the DOM text as the e2e
        // suite sees it.
        let mut out = String::with_capacity(body.len());
        let mut in_tag = false;
        for c in body.chars() {
            match c {
                '<' => in_tag = true,
                '>' => in_tag = false,
                c if !in_tag => out.push(c),
                _ => {}
            }
        }
        out.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    /// Read the app's persisted conversation state (zustand persist →
    /// localStorage). Returns (message count, last role, last content)
    /// of the most recently updated conversation, or None when the
    /// execute channel is flaky / state is absent. The persisted store
    /// updates per streamed delta, so this is both the completion
    /// signal and the clean answer source (no DOM chrome).
    async fn store_tail(&self, sid: &str) -> Option<(usize, String, String)> {
        let v = self
            .execute(
                sid,
                // NOTE: the wdio plugin's execute/sync only surfaces an
                // EXPLICIT top-level `return` — a trailing IIFE expression
                // silently evaluates to null.
                "return (function(){ \
                   const raw = localStorage.getItem('prefrontal-conversation-storage'); \
                   if (!raw) return JSON.stringify({ok:false, why:'no-store'}); \
                   let d; try { d = JSON.parse(raw); } catch(e) { return JSON.stringify({ok:false, why:'parse'}); } \
                   const convs = (d.state && d.state.conversations) || []; \
                   if (!convs.length) return JSON.stringify({ok:false, why:'no-conv'}); \
                   const conv = convs.reduce((a,b) => String(a.updatedAt) > String(b.updatedAt) ? a : b, convs[0]); \
                   const msgs = conv.messages || []; \
                   if (!msgs.length) return JSON.stringify({ok:false, why:'no-msg'}); \
                   const last = msgs[msgs.length-1]; \
                   return JSON.stringify({ok:true, count: msgs.length, role: last.role, content: last.content}); \
                 })()",
            )
            .await;
        let parsed: Value = serde_json::from_str(v.as_str()?).ok()?;
        if parsed["ok"] != json!(true) {
            return None;
        }
        Some((
            parsed["count"].as_u64().unwrap_or(0) as usize,
            parsed["role"].as_str().unwrap_or("").to_string(),
            parsed["content"].as_str().unwrap_or("").to_string(),
        ))
    }
}

#[async_trait]
impl AgentAdapter for ShadowDesktopAgent {
    fn name(&self) -> &str {
        &self.name
    }

    async fn run(&self, task: &Task, _workdir: &Path) -> Result<AgentRun, AgentError> {
        let started = Instant::now();
        let sid = self.ensure_session().await?;

        // Reach the conversation page; first-run installs the setup
        // guard bypass (same trick the e2e suite uses).
        self.wd(
            "POST",
            &format!("/session/{sid}/url"),
            Some(json!({"url": format!("{}/conversation", self.app_url)})),
        )
        .await?;
        tokio::time::sleep(Duration::from_secs(3)).await;
        self.execute(
            &sid,
            "if (!localStorage.getItem('shadow_setup_complete')) { localStorage.setItem('shadow_setup_complete','1'); } 'ok'",
        )
        .await;
        self.wd(
            "POST",
            &format!("/session/{sid}/url"),
            Some(json!({"url": format!("{}/conversation", self.app_url)})),
        )
        .await?;
        tokio::time::sleep(Duration::from_secs(3)).await;

        // Fresh conversation so previous replies don't pollute the read.
        if let Some(btn) = self
            .find_element(&sid, "//button[contains(., '新对话')]")
            .await
        {
            let _ = self
                .wd("POST", &format!("/session/{sid}/element/{btn}/click"), Some(json!({})))
                .await;
            tokio::time::sleep(Duration::from_secs(2)).await;
        }

        // Type the instruction (React controlled input needs the native
        // setter + input event) and click send. The wdio plugin's
        // execute/sync response serialization is flaky (sometimes null
        // even when the script ran), so success is judged by the user
        // bubble actually appearing in the DOM — retried up to 3 times.
        let prompt_js = serde_json::to_string(&task.instruction).unwrap_or_default();
        let type_js = format!(
            "const el = document.querySelector('textarea'); \
             if (!el) return 'no-textarea'; \
             const setter = Object.getOwnPropertyDescriptor(\
             window.HTMLTextAreaElement.prototype, 'value').set; \
             setter.call(el, {prompt_js}); \
             el.dispatchEvent(new Event('input', {{bubbles: true}})); \
             el.dispatchEvent(new KeyboardEvent('keydown', \
               {{key: 'Enter', code: 'Enter', bubbles: true}})); \
             'typed'"
        );
        let needle: String = task
            .instruction
            .split_whitespace()
            .take(6)
            .collect::<Vec<_>>()
            .join(" ");

        let mut sent = false;
        for attempt in 0..3 {
            let _ = self.execute(&sid, &type_js).await;
            // Enter-dispatch is the primary send; the button click is a
            // fallback targeting the lucide-send icon (the first svg
            // button after the textarea is the VoiceButton / mic).
            if let Some(send) = self
                .find_element(
                    &sid,
                    "//textarea/following::button[.//*[contains(@class,'lucide-send')]][1]",
                )
                .await
            {
                let _ = self
                    .wd(
                        "POST",
                        &format!("/session/{sid}/element/{send}/click"),
                        Some(json!({})),
                    )
                    .await;
            }
            // Wait briefly for the user bubble to render.
            let confirm_deadline = Instant::now() + Duration::from_secs(15);
            while Instant::now() < confirm_deadline {
                tokio::time::sleep(Duration::from_secs(3)).await;
                let text = self.page_text(&sid).await;
                if text.contains(&needle) {
                    sent = true;
                    break;
                }
            }
            if sent {
                break;
            }
            let _ = attempt; // logged via the final error only
        }
        if !sent {
            return Err(AgentError::Failed {
                agent: self.name.clone(),
                message: "instruction never rendered as a user bubble after 3 attempts"
                    .into(),
            });
        }

        // Poll the persisted store for the assistant reply. During
        // generation the streaming bubble updates the store per delta;
        // done when the last message is an assistant message whose
        // content is stable across two polls.
        let mut prev_answer = String::new();
        let mut stable = 0u32;
        let deadline = Instant::now() + Duration::from_secs(self.reply_timeout_secs);
        let answer = loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            if Instant::now() > deadline {
                return Err(AgentError::Failed {
                    agent: self.name.clone(),
                    message: format!(
                        "reply did not stabilise within {}s; last: {prev_answer:?}",
                        self.reply_timeout_secs
                    ),
                });
            }
            let Some((count, role, content)) = self.store_tail(&sid).await else {
                continue;
            };
            let streaming = count >= 2 && role == "assistant" && !content.is_empty();
            if !streaming {
                continue;
            }
            if content == prev_answer {
                stable += 1;
                if stable >= 2 {
                    break content;
                }
            } else {
                stable = 0;
                prev_answer = content;
            }
        };

        Ok(AgentRun {
            answer,
            duration: started.elapsed(),
            exit_code: None,
        })
    }
}
