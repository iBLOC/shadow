//! Tool-calling surface for the agentic bench adapters.
//!
//! The agentic scaffold gives the model a small, fixed tool set that
//! runs against the task workdir:
//!
//! | tool         | what it does                                        |
//! |--------------|-----------------------------------------------------|
//! | `bash`       | run a shell command in the workdir                  |
//! | `read_file`  | read a file (truncated)                              |
//! | `write_file` | write a file (creates parent dirs)                  |
//! | `list_files` | list files under a relative path                     |
//! | `finish`     | end the episode and hand back a summary              |
//!
//! The set is deliberately minimal: it is enough for a model to
//! explore a checkout, patch a file and verify the change, which is
//! what the SWE / Terminal-Bench slices actually measure. Everything
//! stays inside the task workdir — `safe_join` refuses absolute paths
//! and `..` escapes.

use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};

/// Max characters of command/file output handed back to the model.
/// Long output burns the context window and the model's attention;
/// the tail is usually the interesting part (errors, test output).
pub const MAX_OUTPUT_CHARS: usize = 12_000;

/// Max files returned by `list_files`.
pub const MAX_LIST_ENTRIES: usize = 500;

/// Max bytes downloaded by `web_fetch` before the response is cut.
pub const MAX_FETCH_BYTES: usize = 2 * 1024 * 1024;

/// JSON schema of one tool, in OpenAI function-calling shape.
pub fn tool_schemas() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "bash",
                "description": "Run a shell command in the working directory. Returns stdout, stderr and the exit code. Use it to explore the repository, run tests, and check your changes.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string", "description": "The command line to run."}
                    },
                    "required": ["command"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read a file from the working directory. Long files are truncated.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Path relative to the working directory."}
                    },
                    "required": ["path"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write a file in the working directory, creating parent directories as needed. Overwrites the file if it exists.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Path relative to the working directory."},
                        "content": {"type": "string", "description": "Full new content of the file."}
                    },
                    "required": ["path", "content"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "list_files",
                "description": "List files in the working directory, optionally under a subdirectory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Subdirectory to list; omit for the working directory root."}
                    },
                    "required": []
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Replace an exact snippet in a file. The snippet must appear exactly once. Use this instead of rewriting whole files — it is far cheaper and safer. Read the file first so the snippet matches byte for byte.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Path relative to the working directory."},
                        "search": {"type": "string", "description": "Exact text to replace, including indentation."},
                        "replace": {"type": "string", "description": "The replacement text."}
                    },
                    "required": ["path", "search", "replace"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "web_fetch",
                "description": "Fetch a public http(s) URL and return its text content (HTML is stripped to text). Use it to look up facts you cannot recall.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "Absolute http(s) URL."}
                    },
                    "required": ["url"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "finish",
                "description": "Finish the task. Call this once the work is done; put your final summary in `summary`.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string", "description": "What was changed and why."}
                    },
                    "required": ["summary"]
                }
            }
        }),
    ]
}

/// A tool call as the model requested it.
#[derive(Debug, Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    /// Parsed arguments object (empty when the model sent junk).
    pub args: Value,
}

impl ToolCall {
    /// Parse one entry of `choices[0].message.tool_calls`.
    pub fn from_json(v: &Value) -> Option<Self> {
        let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let function = v.get("function")?;
        let name = function.get("name").and_then(|x| x.as_str())?.to_string();
        // `arguments` is a JSON *string* per the OpenAI schema, but
        // some providers send an object — accept both.
        let args = match function.get("arguments") {
            Some(Value::String(s)) => serde_json::from_str::<Value>(s).unwrap_or_else(|_| json!({})),
            Some(other) => other.clone(),
            None => json!({}),
        };
        Some(Self { id, name, args })
    }

    pub fn arg_str(&self, key: &str) -> Option<&str> {
        self.args.get(key).and_then(|v| v.as_str())
    }
}

/// Join a model-supplied relative path onto `workdir`, refusing
/// anything that escapes it.
///
/// Returns `None` for absolute paths, drive-letter paths, `..`
/// traversal, and empty paths.
pub fn safe_join(workdir: &Path, rel: &str) -> Option<PathBuf> {
    let rel = rel.trim();
    if rel.is_empty() {
        return None;
    }
    let p = Path::new(rel);
    if p.is_absolute() {
        return None;
    }
    // Windows drive letters ("C:foo") and UNC prefixes are absolute
    // in effect even when `is_absolute()` says otherwise.
    if rel.contains(':') {
        return None;
    }
    let mut out = workdir.to_path_buf();
    for comp in p.components() {
        match comp {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::ParentDir => return None,
            Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    if out == workdir {
        // A bare "." would list/overwrite the workdir itself.
        return None;
    }
    Some(out)
}

/// Truncate `text` to `MAX_OUTPUT_CHARS`, keeping the tail (where
/// test failures and error messages live) and marking the cut.
pub fn truncate_tail(text: &str) -> String {
    if text.chars().count() <= MAX_OUTPUT_CHARS {
        return text.to_string();
    }
    let out: String = text.chars().rev().take(MAX_OUTPUT_CHARS).collect::<Vec<char>>()
        .into_iter()
        .rev()
        .collect();
    format!("…[truncated]\n{out}")
}

/// Result of executing one tool call.
#[derive(Debug, Clone)]
pub struct ToolOutcome {
    /// Text handed back to the model as the tool message.
    pub content: String,
    /// True when the tool signalled the end of the episode.
    pub finished: bool,
}

/// Execute one tool call against `workdir`.
///
/// Unknown tools and bad arguments come back as an error *message*
/// (not a panic): the model can read the message and retry, which is
/// the behaviour the agentic loop depends on.
pub async fn execute(call: &ToolCall, workdir: &Path) -> ToolOutcome {
    match call.name.as_str() {
        "bash" => {
            let Some(command) = call.arg_str("command") else {
                return ToolOutcome {
                    content: "error: 'bash' requires a 'command' argument".into(),
                    finished: false,
                };
            };
            run_bash(command, workdir).await
        }
        "read_file" => {
            let Some(rel) = call.arg_str("path") else {
                return ToolOutcome {
                    content: "error: 'read_file' requires a 'path' argument".into(),
                    finished: false,
                };
            };
            let Some(abs) = safe_join(workdir, rel) else {
                return ToolOutcome {
                    content: format!("error: refusing path outside the working directory: {rel}"),
                    finished: false,
                };
            };
            match tokio::fs::read_to_string(&abs).await {
                Ok(text) => ToolOutcome {
                    content: truncate_tail(&text),
                    finished: false,
                },
                Err(e) => ToolOutcome {
                    content: format!("error: cannot read {rel}: {e}"),
                    finished: false,
                },
            }
        }
        "write_file" => {
            let Some(rel) = call.arg_str("path") else {
                return ToolOutcome {
                    content: "error: 'write_file' requires a 'path' argument".into(),
                    finished: false,
                };
            };
            let Some(abs) = safe_join(workdir, rel) else {
                return ToolOutcome {
                    content: format!("error: refusing path outside the working directory: {rel}"),
                    finished: false,
                };
            };
            let content = call.arg_str("content").unwrap_or("");
            if let Some(parent) = abs.parent() {
                if let Err(e) = tokio::fs::create_dir_all(parent).await {
                    return ToolOutcome {
                        content: format!("error: cannot create {}: {e}", parent.display()),
                        finished: false,
                    };
                }
            }
            match tokio::fs::write(&abs, content).await {
                Ok(()) => ToolOutcome {
                    content: format!("wrote {rel} ({} bytes)", content.len()),
                    finished: false,
                },
                Err(e) => ToolOutcome {
                    content: format!("error: cannot write {rel}: {e}"),
                    finished: false,
                },
            }
        }
        "list_files" => {
            let rel = call.arg_str("path").unwrap_or(".");
            let Some(abs) = safe_join(workdir, rel) else {
                return ToolOutcome {
                    content: format!("error: refusing path outside the working directory: {rel}"),
                    finished: false,
                };
            };
            list_files(&abs, rel).await
        }
        "finish" => {
            let summary = call.arg_str("summary").unwrap_or("(no summary given)");
            ToolOutcome {
                content: format!("episode finished: {summary}"),
                finished: true,
            }
        }
        "edit_file" => {
            let Some(rel) = call.arg_str("path") else {
                return ToolOutcome {
                    content: "error: 'edit_file' requires a 'path' argument".into(),
                    finished: false,
                };
            };
            let Some(abs) = safe_join(workdir, rel) else {
                return ToolOutcome {
                    content: format!("error: refusing path outside the working directory: {rel}"),
                    finished: false,
                };
            };
            let search = call.arg_str("search").unwrap_or("");
            let replace = call.arg_str("replace").unwrap_or("");
            if search.is_empty() {
                return ToolOutcome {
                    content: "error: 'edit_file' requires a non-empty 'search' argument".into(),
                    finished: false,
                };
            }
            let current = match tokio::fs::read_to_string(&abs).await {
                Ok(t) => t,
                Err(e) => {
                    return ToolOutcome {
                        content: format!("error: cannot read {rel}: {e}"),
                        finished: false,
                    }
                }
            };
            let count = current.matches(search).count();
            if count == 0 {
                return ToolOutcome {
                    content: format!(
                        "error: the snippet was not found in {rel}. Read the file again and copy the text exactly (indentation included)."
                    ),
                    finished: false,
                };
            }
            if count > 1 {
                return ToolOutcome {
                    content: format!(
                        "error: the snippet appears {count} times in {rel}. Include more surrounding context so it is unique."
                    ),
                    finished: false,
                };
            }
            let updated = current.replacen(search, replace, 1);
            match tokio::fs::write(&abs, &updated).await {
                Ok(()) => ToolOutcome {
                    content: format!("edited {rel} ({} bytes)", updated.len()),
                    finished: false,
                },
                Err(e) => ToolOutcome {
                    content: format!("error: cannot write {rel}: {e}"),
                    finished: false,
                },
            }
        }
        "web_fetch" => {
            let Some(url) = call.arg_str("url") else {
                return ToolOutcome {
                    content: "error: 'web_fetch' requires a 'url' argument".into(),
                    finished: false,
                };
            };
            match fetch_url(url).await {
                Ok(text) => ToolOutcome {
                    content: text,
                    finished: false,
                },
                Err(e) => ToolOutcome {
                    content: format!("error: {e}"),
                    finished: false,
                },
            }
        }
        other => ToolOutcome {
            content: format!(
                "error: unknown tool '{other}'; available tools: bash, read_file, write_file, list_files, finish"
            ),
            finished: false,
        },
    }
}

/// Fetch a public http(s) URL and return its text.
///
/// Guards: http(s) only, no loopback/private/link-local addresses
/// (the bench runs on a developer machine — a model must not be able
/// to probe it), response body capped at [`MAX_FETCH_BYTES`], and the
/// text handed to the model capped at [`MAX_OUTPUT_CHARS`].
async fn fetch_url(url: &str) -> Result<String, String> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|e| format!("bad url: {e}"))?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("only http(s) urls are allowed, got '{scheme}'"));
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "url has no host".to_string())?;

    // Resolve first: a hostname can point at a private address.
    let addrs: Vec<std::net::IpAddr> = tokio::net::lookup_host((host, parsed.port_or_known_default().unwrap_or(443)))
        .await
        .map_err(|e| format!("cannot resolve '{host}': {e}"))?
        .map(|a| a.ip())
        .collect();
    if addrs.is_empty() {
        return Err(format!("'{host}' resolved to no address"));
    }
    for ip in &addrs {
        if is_private_ip(ip) {
            return Err(format!(
                "refusing to fetch '{host}': {ip} is a loopback/private/link-local address"
            ));
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("shadow-benchmark/0.1 (agent tool)")
        .build()
        .map_err(|e| format!("client build failed: {e}"))?;
    let resp = client
        .get(parsed.clone())
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("body read failed: {e}"))?;
    let truncated = bytes.len() > MAX_FETCH_BYTES;
    let slice = &bytes[..bytes.len().min(MAX_FETCH_BYTES)];
    let content_type = String::new();
    let _ = content_type;
    let raw = String::from_utf8_lossy(slice);
    let text = html_to_text(&raw);
    let mut out = truncate_tail(&text);
    if truncated {
        out.push_str(&format!("\n[truncated at {MAX_FETCH_BYTES} bytes]"));
    }
    Ok(out)
}

/// True for addresses that must not be reachable from a tool call:
/// loopback, private ranges, link-local, and unspecified.
fn is_private_ip(ip: &std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
        }
        std::net::IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                // unique local (fc00::/7) and link local (fe80::/10)
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                || (v6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

/// Tags that imply a line break in the rendered text.
const BLOCK_TAGS: [&str; 14] = [
    "p", "br", "div", "li", "ul", "ol", "tr", "td", "th", "h1", "h2", "h3", "h4", "section",
];

/// Strip HTML to readable text.
///
/// Not a full parser: `<script>`/`<style>` bodies are dropped, tags
/// are removed (block-level ones become a line break), and the common
/// named entities are decoded. The goal is a page the model can read,
/// not fidelity.
fn html_to_text(html: &str) -> String {
    let chars: Vec<char> = html.chars().collect();
    // `to_ascii_lowercase` preserves the character count, so the two
    // vectors stay index-aligned.
    let lower: Vec<char> = html.to_ascii_lowercase().chars().collect();
    let mut out = String::with_capacity(chars.len());
    let mut i = 0usize;

    while i < chars.len() {
        match chars[i] {
            '<' => {
                // Find the end of the tag.
                let end = lower[i..]
                    .iter()
                    .position(|c| *c == '>')
                    .map(|p| i + p)
                    .unwrap_or(chars.len());
                let tag: String = lower[i + 1..end.min(chars.len())].iter().collect();
                let name: String = tag
                    .chars()
                    .take_while(|c| c.is_ascii_alphanumeric())
                    .collect();

                if (name == "script" || name == "style") && !tag.trim_end().ends_with('/') {
                    // Skip the whole element body, not just its tag.
                    let close = format!("</{name}");
                    let rest: String = lower[end..].iter().collect();
                    match rest.find(&close) {
                        Some(p) => {
                            i = end + p + close.len();
                            continue;
                        }
                        None => {
                            i = chars.len();
                            continue;
                        }
                    }
                }
                if BLOCK_TAGS.contains(&name.as_str()) {
                    out.push('\n');
                }
                i = end + 1;
            }
            '&' => {
                // Decode the common named entities.
                let rest: String = lower[i..].iter().take(12).collect();
                let decoded = if let Some(semi) = rest.find(';') {
                    match &rest[1..semi] {
                        "amp" => Some('&'),
                        "lt" => Some('<'),
                        "gt" => Some('>'),
                        "quot" => Some('"'),
                        "apos" => Some('\''),
                        "nbsp" => Some(' '),
                        _ => None,
                    }
                } else {
                    None
                };
                match decoded {
                    Some(c) => {
                        out.push(c);
                        i += rest.find(';').unwrap_or(0) + 1;
                    }
                    None => {
                        out.push('&');
                        i += 1;
                    }
                }
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }

    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Run a shell command in `workdir` and report its output.
///
/// Models write POSIX shell commands (`ls; grep -n ... | head`, `sed
/// -n 1,200p`, heredocs). Under `cmd.exe` those are silently
/// mis-parsed — `;` is not a command separator there, so `ls` ends up
/// swallowing the whole line as arguments and the agent burns its
/// step budget on shell-syntax errors instead of on the task. So we
/// prefer a POSIX shell and only fall back to `cmd` when none is
/// available.
async fn run_bash(command: &str, workdir: &Path) -> ToolOutcome {
    for shell in posix_shells() {
        if let Some(out) = run_in_shell(&shell, command, workdir).await {
            return out;
        }
    }

    // Windows fallback: cmd.exe.
    let mut cmd = tokio::process::Command::new("cmd");
    cmd.arg("/C")
        .arg(command)
        .current_dir(workdir)
        .kill_on_drop(true);
    cmd.stdin(std::process::Stdio::null());
    match cmd.output().await {
        Ok(out) => ToolOutcome {
            content: format_shell_output(&out),
            finished: false,
        },
        Err(e) => ToolOutcome {
            content: format!("error: cannot run command: {e}"),
            finished: false,
        },
    }
}

/// Candidate POSIX shells, most specific first.
///
/// On Windows the Git-for-Windows bash is preferred over whatever
/// `bash` resolves to on PATH (which may be WSL's, where the workdir
/// path would not exist).
fn posix_shells() -> Vec<String> {
    let mut shells: Vec<String> = Vec::new();
    if cfg!(windows) {
        for candidate in [
            "C:\\Program Files\\Git\\bin\\bash.exe",
            "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
        ] {
            if Path::new(candidate).exists() {
                shells.push(candidate.to_string());
            }
        }
    }
    shells.push("bash".to_string());
    shells.push("sh".to_string());
    shells
}

/// Run `command` under `shell`; `None` when the shell does not exist.
async fn run_in_shell(shell: &str, command: &str, workdir: &Path) -> Option<ToolOutcome> {
    let mut cmd = tokio::process::Command::new(shell);
    cmd.arg("-c")
        .arg(command)
        .current_dir(workdir)
        .kill_on_drop(true);
    cmd.stdin(std::process::Stdio::null());
    match cmd.output().await {
        Ok(out) => Some(ToolOutcome {
            content: format_shell_output(&out),
            finished: false,
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => Some(ToolOutcome {
            content: format!("error: cannot run command: {e}"),
            finished: false,
        }),
    }
}

/// Format a finished command's output for the model.
fn format_shell_output(out: &std::process::Output) -> String {
    let mut text = String::new();
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !stdout.trim().is_empty() {
        text.push_str(stdout.trim_end());
    }
    if !stderr.trim().is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str("[stderr]\n");
        text.push_str(stderr.trim_end());
    }
    let code = out.status.code().unwrap_or(-1);
    if text.is_empty() {
        text.push_str("(no output)");
    }
    text.push_str(&format!("\n[exit code: {code}]"));
    truncate_tail(&text)
}

/// List files under `abs`, relative to `label`.
async fn list_files(abs: &Path, label: &str) -> ToolOutcome {
    let mut entries: Vec<String> = Vec::new();
    let mut stack = vec![abs.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(mut rd) = tokio::fs::read_dir(&dir).await else {
            continue;
        };
        let mut children: Vec<tokio::fs::DirEntry> = Vec::new();
        while let Ok(Some(entry)) = rd.next_entry().await {
            children.push(entry);
        }
        children.sort_by_key(|e| e.file_name());
        for child in children {
            let name = child.file_name().to_string_lossy().to_string();
            if name == ".git" || name == "node_modules" || name == "target" {
                continue;
            }
            let path = child.path();
            let rel = path
                .strip_prefix(abs)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            if path.is_dir() {
                stack.push(path);
                entries.push(format!("{rel}/"));
            } else {
                entries.push(rel);
            }
            if entries.len() >= MAX_LIST_ENTRIES {
                break;
            }
        }
        if entries.len() >= MAX_LIST_ENTRIES {
            break;
        }
    }
    entries.sort();
    let mut text = if entries.is_empty() {
        format!("(no files under {label})")
    } else {
        entries.join("\n")
    };
    if entries.len() >= MAX_LIST_ENTRIES {
        text.push_str(&format!("\n…[truncated at {MAX_LIST_ENTRIES} entries]"));
    }
    ToolOutcome {
        content: truncate_tail(&text),
        finished: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_rejects_escapes() {
        let wd = Path::new("/tmp/work");
        assert!(safe_join(wd, "src/main.rs").is_some());
        assert!(safe_join(wd, "./src/main.rs").is_some());
        assert!(safe_join(wd, "../etc/passwd").is_none());
        assert!(safe_join(wd, "a/../../b").is_none());
        assert!(safe_join(wd, "/etc/passwd").is_none());
        assert!(safe_join(wd, "C:\\Windows\\system32").is_none());
        assert!(safe_join(wd, "").is_none());
        assert!(safe_join(wd, ".").is_none());
    }

    #[test]
    fn tool_call_parses_string_and_object_arguments() {
        let a = ToolCall::from_json(&json!({
            "id": "call_1",
            "type": "function",
            "function": {"name": "bash", "arguments": "{\"command\":\"ls -la\"}"}
        }))
        .expect("parse");
        assert_eq!(a.name, "bash");
        assert_eq!(a.arg_str("command"), Some("ls -la"));

        let b = ToolCall::from_json(&json!({
            "id": "call_2",
            "function": {"name": "write_file", "arguments": {"path": "a.txt", "content": "x"}}
        }))
        .expect("parse");
        assert_eq!(b.arg_str("path"), Some("a.txt"));

        // Junk arguments must not panic.
        let c = ToolCall::from_json(&json!({
            "id": "call_3",
            "function": {"name": "bash", "arguments": "not json"}
        }))
        .expect("parse");
        assert!(c.arg_str("command").is_none());
    }

    #[test]
    fn unknown_tool_returns_message_not_panic() {
        let call = ToolCall {
            id: "x".into(),
            name: "nope".into(),
            args: json!({}),
        };
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let out = rt.block_on(execute(&call, Path::new(".")));
        assert!(out.content.contains("unknown tool"));
        assert!(!out.finished);
    }

    #[test]
    fn finish_signals_end_of_episode() {
        let call = ToolCall {
            id: "x".into(),
            name: "finish".into(),
            args: json!({"summary": "patched the parser"}),
        };
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let out = rt.block_on(execute(&call, Path::new(".")));
        assert!(out.finished);
        assert!(out.content.contains("patched the parser"));
    }

    #[test]
    fn write_and_read_roundtrip_inside_workdir() {
        let dir = std::env::temp_dir().join("shadow-bench-tools-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let write = ToolCall {
            id: "w".into(),
            name: "write_file".into(),
            args: json!({"path": "pkg/mod.txt", "content": "hello"}),
        };
        let out = rt.block_on(execute(&write, &dir));
        assert!(out.content.contains("wrote pkg/mod.txt"), "{}", out.content);
        assert_eq!(
            std::fs::read_to_string(dir.join("pkg").join("mod.txt")).unwrap(),
            "hello"
        );

        let read = ToolCall {
            id: "r".into(),
            name: "read_file".into(),
            args: json!({"path": "pkg/mod.txt"}),
        };
        let out = rt.block_on(execute(&read, &dir));
        assert_eq!(out.content, "hello");

        // A path that escapes the workdir is refused.
        let escape = ToolCall {
            id: "e".into(),
            name: "read_file".into(),
            args: json!({"path": "../outside.txt"}),
        };
        let out = rt.block_on(execute(&escape, &dir));
        assert!(out.content.contains("refusing path"), "{}", out.content);
    }

    #[test]
    fn truncate_keeps_tail() {
        let long = "a".repeat(MAX_OUTPUT_CHARS + 100);
        let out = truncate_tail(&long);
        assert!(out.starts_with("…[truncated]"));
        assert_eq!(out.chars().count(), MAX_OUTPUT_CHARS + "…[truncated]\n".chars().count());
    }

    #[test]
    fn private_addresses_are_refused() {
        use std::net::IpAddr;
        assert!(is_private_ip(&"127.0.0.1".parse::<IpAddr>().unwrap()));
        assert!(is_private_ip(&"10.0.0.5".parse::<IpAddr>().unwrap()));
        assert!(is_private_ip(&"192.168.1.1".parse::<IpAddr>().unwrap()));
        assert!(is_private_ip(&"172.16.0.1".parse::<IpAddr>().unwrap()));
        assert!(is_private_ip(&"169.254.1.1".parse::<IpAddr>().unwrap()));
        assert!(is_private_ip(&"::1".parse::<IpAddr>().unwrap()));
        assert!(is_private_ip(&"fe80::1".parse::<IpAddr>().unwrap()));
        assert!(is_private_ip(&"fd00::1".parse::<IpAddr>().unwrap()));
        // Public addresses stay fetchable.
        assert!(!is_private_ip(&"93.184.216.34".parse::<IpAddr>().unwrap()));
        assert!(!is_private_ip(&"2606:2800:220:1::1".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn html_to_text_drops_tags_scripts_and_entities() {
        let html = r#"<html><head><title>T</title><style>b{}</style></head>
            <body><script>var x = 1;</script><p>Hello &amp; welcome</p>
            <ul><li>one</li><li>two</li></ul></body></html>"#;
        let text = html_to_text(html);
        assert!(text.contains("Hello & welcome"), "{text}");
        assert!(text.contains("one") && text.contains("two"), "{text}");
        assert!(!text.contains("var x"), "script body leaked: {text}");
        assert!(!text.contains("b{}"), "style body leaked: {text}");
        assert!(!text.contains('<'), "tags leaked: {text}");
    }

    #[test]
    fn html_to_text_keeps_non_ascii_intact() {
        let text = html_to_text("<p>影 · 分身 · café</p>");
        assert!(text.contains("影 · 分身 · café"), "{text}");
    }

    #[test]
    fn edit_file_replaces_exact_snippet() {
        let dir = std::env::temp_dir().join("shadow-bench-edit-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.py"), "def f():\n    return 1\n").unwrap();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let call = ToolCall {
            id: "e".into(),
            name: "edit_file".into(),
            args: json!({"path": "a.py", "search": "    return 1", "replace": "    return 2"}),
        };
        let out = rt.block_on(execute(&call, &dir));
        assert!(out.content.contains("edited a.py"), "{}", out.content);
        assert!(std::fs::read_to_string(dir.join("a.py"))
            .unwrap()
            .contains("return 2"));

        // A snippet that is not there must say so, not corrupt the file.
        let miss = ToolCall {
            id: "e2".into(),
            name: "edit_file".into(),
            args: json!({"path": "a.py", "search": "return 99", "replace": "x"}),
        };
        let out = rt.block_on(execute(&miss, &dir));
        assert!(out.content.contains("not found"), "{}", out.content);
        assert!(std::fs::read_to_string(dir.join("a.py"))
            .unwrap()
            .contains("return 2"));
    }

    #[test]
    fn edit_file_refuses_ambiguous_snippet() {
        let dir = std::env::temp_dir().join("shadow-bench-edit-dup-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("b.py"), "x = 1\nx = 1\n").unwrap();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let call = ToolCall {
            id: "e".into(),
            name: "edit_file".into(),
            args: json!({"path": "b.py", "search": "x = 1", "replace": "x = 2"}),
        };
        let out = rt.block_on(execute(&call, &dir));
        assert!(out.content.contains("appears 2 times"), "{}", out.content);
        // The file is untouched.
        assert_eq!(
            std::fs::read_to_string(dir.join("b.py")).unwrap(),
            "x = 1\nx = 1\n"
        );
    }

    /// The regression that mattered: under cmd.exe the agent's
    /// `ls; grep -n "x" f | head` mis-parses (`;` is not a separator),
    /// so `ls` swallows the whole line. A POSIX shell must run it.
    #[test]
    fn bash_runs_posix_command_sequences() {
        let dir = std::env::temp_dir().join("shadow-bench-bash-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("f.txt"), "alpha\nbeta\n").unwrap();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let call = ToolCall {
            id: "b".into(),
            name: "bash".into(),
            args: json!({"command": "ls; grep -n beta f.txt | head -1"}),
        };
        let out = rt.block_on(execute(&call, &dir));
        // The `;` must separate the commands, and the pipe must work.
        assert!(
            out.content.contains("f.txt"),
            "first command did not run: {}",
            out.content
        );
        assert!(
            out.content.contains("2:beta"),
            "grep|head did not run: {}",
            out.content
        );
    }
}
