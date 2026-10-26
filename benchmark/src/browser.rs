//! Headless browser tools for the agentic loop.
//!
//! A minimal W3C WebDriver client over reqwest (no new deps). Targets
//! any conformant driver: shadow-desktop's wdio plugin, Selenium
//! standalone, Appium, etc. Exposes three tool calls: `browser_navigate`
//! (URL), `browser_snapshot` (current page's a11y tree, condensed
//! to visible text + roles), `browser_click` (CSS selector). Together
//! they give an LLM a usable read/write loop on any real page without
//! pulling in the heavyweight fantoccini stack.
//!
//! Session is created lazily and reused across calls (the W3C spec
//! requires it). Per-call timeout is the standard driver command
//! timeout (10s); navigation gets the full 60s.
//!
//! Why not just web_fetch? `web_fetch` returns prose, useful for
//! reading articles. The browser tools give an LLM the ability to
//! interact — click "next page", dismiss a cookie banner, fill a
//! form. GAIA's "click the link" questions need exactly this; pure
//! fetch can't answer them.

use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

/// Compact representation of a web element for the LLM. The
/// `outer_text` is the most useful field — it strips tags, collapses
/// whitespace, and gives the model what a sighted user would see.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Snapshot {
    pub title: String,
    pub url: String,
    /// Visible text from the whole page, capped at ~16k chars.
    pub outer_text: String,
    /// Top-level interactive controls: text + CSS selector.
    pub interactives: Vec<Interactive>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Interactive {
    pub tag: String,
    pub text: String,
    pub selector: String,
}

/// Per-process W3C WebDriver session. Cheap; one is enough for an
/// entire agent run, so we share it via `Arc<Mutex>`.
pub struct WebDriverSession {
    base: String,        // e.g. "http://127.0.0.1:4445"
    base_path: String,   // usually "/"
    session_id: Mutex<Option<String>>,
    client: reqwest::Client,
}

impl WebDriverSession {
    pub fn new(webdriver_url: impl Into<String>) -> Arc<Self> {
        let base_raw = webdriver_url.into().trim_end_matches('/').to_string();
        // Most wdio/selenium drivers serve both v1 (W3C) at / and
        // legacy at /wd/hub. Default to / and fall through.
        let (base, base_path) = if base_raw.ends_with("/wd/hub") {
            (base_raw.trim_end_matches("/wd/hub").to_string(), "/wd/hub".to_string())
        } else {
            (base_raw.clone(), "/".to_string())
        };
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(60))
            .build()
            .unwrap_or_default();
        Arc::new(Self {
            base,
            base_path,
            session_id: Mutex::new(None),
            client,
        })
    }

    async fn ensure_session(&self) -> Result<String, String> {
        let mut guard = self.session_id.lock().await;
        if let Some(id) = guard.as_ref() {
            return Ok(id.clone());
        }
        // Pick a browser the W3C standard supports; chromedriver and
        // geckodriver both honour this. The wdio plugin uses chrome by
        // default.
        let body = serde_json::json!({
            "capabilities": {
                "alwaysMatch": {
                    "browserName": "chrome"
                }
            }
        });
        let url = format!("{}{}/session", self.base, self.base_path);
        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("webdriver POST {url}: {e}"))?;
        let status = resp.status();
        let v: Value = resp
            .json()
            .await
            .map_err(|e| format!("webdriver body at {status}: {e}"))?;
        let id = v["value"]["sessionId"]
            .as_str()
            .ok_or_else(|| format!("webdriver create session: no sessionId in {v}"))?
            .to_string();
        *guard = Some(id.clone());
        Ok(id)
    }

    async fn post(&self, path: &str, body: &Value) -> Result<Value, String> {
        let session = self.ensure_session().await?;
        let url = format!(
            "{}{}/session/{}{}",
            self.base, self.base_path, session, path
        );
        let resp = self
            .client
            .post(&url)
            .json(body)
            .send()
            .await
            .map_err(|e| format!("webdriver POST {url}: {e}"))?;
        let status = resp.status();
        let v: Value = resp
            .json()
            .await
            .map_err(|e| format!("webdriver body at {status}: {e}"))?;
        if !status.is_success() {
            return Err(format!("webdriver POST {url} HTTP {status}: {v}"));
        }
        Ok(v)
    }

    async fn get(&self, path: &str) -> Result<Value, String> {
        let session = self.ensure_session().await?;
        let url = format!(
            "{}{}/session/{}{}",
            self.base, self.base_path, session, path
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("webdriver GET {url}: {e}"))?;
        let status = resp.status();
        let v: Value = resp
            .json()
            .await
            .map_err(|e| format!("webdriver body at {status}: {e}"))?;
        if !status.is_success() {
            return Err(format!("webdriver GET {url} HTTP {status}: {v}"));
        }
        Ok(v)
    }

    pub async fn navigate(&self, url: &str) -> Result<Snapshot, String> {
        self.post("/url", &serde_json::json!({ "url": url })).await?;
        self.snapshot().await
    }

    pub async fn snapshot(&self) -> Result<Snapshot, String> {
        // W3C: GET /title, GET /url, GET /text (rendered), POST
        // /element with :has-css pseudo to enumerate interactives.
        let title = self
            .get("/title")
            .await?
            .get("value")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let url = self
            .get("/url")
            .await?
            .get("value")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let text = self
            .get("/text")
            .await?
            .get("value")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let interactives = self.list_interactives().await.unwrap_or_default();
        let mut snap = Snapshot {
            title,
            url,
            outer_text: collapse_whitespace(&text),
            interactives,
        };
        // Cap to 16k chars — the agent's context window is the
        // real constraint, and the snapshot is a complement to
        // web_fetch (which already trims to 12k).
        const CAP: usize = 16 * 1024;
        if snap.outer_text.len() > CAP {
            snap.outer_text.truncate(CAP);
            snap.outer_text.push_str("…[truncated]");
        }
        Ok(snap)
    }

    async fn list_interactives(&self) -> Result<Vec<Interactive>, String> {
        // Find <a>, <button>, <input>, <select>, <textarea>, <button> in
        // the DOM. W3C /elements with `using: "css selector"` and a
        // multi-element selector returns an array; we ask for one tag
        // at a time and merge.
        let mut out = Vec::new();
        for tag in &["a", "button", "input", "select", "textarea"] {
            let body = serde_json::json!({
                "using": "css selector",
                "value": tag,
            });
            let v = match self.post("/elements", &body).await {
                Ok(v) => v,
                Err(_) => continue, // some drivers reject empty lists
            };
            for el in v["value"].as_array().cloned().unwrap_or_default() {
                let id = el["ELEMENT"].as_str().unwrap_or_default();
                if id.is_empty() {
                    continue;
                }
                let text = self
                    .element_text(id)
                    .await
                    .unwrap_or_default();
                let sel = self
                    .element_attr(id, "class")
                    .await
                    .ok()
                    .flatten()
                    .map(|c| format!("{tag}.{c}"))
                    .unwrap_or_else(|| format!("{tag}[id={id}]"));
                out.push(Interactive {
                    tag: tag.to_string(),
                    text: collapse_whitespace(&text),
                    selector: sel,
                });
                if out.len() > 80 {
                    return Ok(out);
                }
            }
        }
        Ok(out)
    }

    async fn element_text(&self, element_id: &str) -> Result<String, String> {
        self.get(&format!("/element/{element_id}/text"))
            .await
            .map(|v| v["value"].as_str().unwrap_or_default().to_string())
    }

    async fn element_attr(
        &self,
        element_id: &str,
        name: &str,
    ) -> Result<Option<String>, String> {
        let v = self
            .get(&format!("/element/{element_id}/attribute/{name}"))
            .await?;
        if v["value"].is_null() {
            Ok(None)
        } else {
            Ok(v["value"].as_str().map(str::to_string))
        }
    }

    pub async fn click(&self, selector: &str) -> Result<Snapshot, String> {
        // Find element by CSS selector, then POST /click on it.
        let body = serde_json::json!({
            "using": "css selector",
            "value": selector,
        });
        let v = self.post("/element", &body).await?;
        let element_id = v["value"]["ELEMENT"]
            .as_str()
            .ok_or_else(|| format!("webdriver /element: no ELEMENT id in {v}"))?
            .to_string();
        self.post(
            &format!("/element/{element_id}/click"),
            &serde_json::json!({}),
        )
        .await?;
        // A click often changes the page; refresh snapshot.
        self.snapshot().await
    }
}

fn collapse_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = true; // trim leading whitespace
    for ch in s.chars() {
        if ch.is_whitespace() {
            if !prev_space {
                out.push(' ');
            }
            prev_space = true;
        } else {
            out.push(ch);
            prev_space = false;
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapse_whitespace_handles_runs_and_edges() {
        assert_eq!(collapse_whitespace("  a  b\tc\nd  "), "a b c d");
        assert_eq!(collapse_whitespace(""), "");
        assert_eq!(collapse_whitespace("no runs"), "no runs");
    }

    #[test]
    fn snapshot_serializes_to_json_for_tool_response() {
        let snap = Snapshot {
            title: "T".into(),
            url: "https://x".into(),
            outer_text: "body".into(),
            interactives: vec![Interactive {
                tag: "a".into(),
                text: "Link".into(),
                selector: "a#m".into(),
            }],
        };
        let j = serde_json::to_value(&snap).unwrap();
        assert_eq!(j["title"], "T");
        assert_eq!(j["interactives"][0]["tag"], "a");
    }
}
