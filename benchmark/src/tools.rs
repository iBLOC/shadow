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
        other => ToolOutcome {
            content: format!(
                "error: unknown tool '{other}'; available tools: bash, read_file, write_file, list_files, finish"
            ),
            finished: false,
        },
    }
}

/// Run a shell command in `workdir` and report its output.
async fn run_bash(command: &str, workdir: &Path) -> ToolOutcome {
    let shell = if cfg!(windows) { "cmd" } else { "sh" };
    let flag = if cfg!(windows) { "/C" } else { "-c" };
    let mut cmd = tokio::process::Command::new(shell);
    cmd.arg(flag)
        .arg(command)
        .current_dir(workdir)
        .kill_on_drop(true);
    // Windows shells inherit stdio handles that break capture; null
    // them explicitly.
    cmd.stdin(std::process::Stdio::null());
    match cmd.output().await {
        Ok(out) => {
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
            ToolOutcome {
                content: truncate_tail(&text),
                finished: false,
            }
        }
        Err(e) => ToolOutcome {
            content: format!("error: cannot run command: {e}"),
            finished: false,
        },
    }
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
}
