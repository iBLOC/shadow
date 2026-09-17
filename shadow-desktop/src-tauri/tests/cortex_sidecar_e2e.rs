//! End-to-end tests for the cortex sidecar embedding.
//!
//! These tests exercise the spawn / readiness / failure-detection flow
//! against small shell-script stand-ins for the real cortex binary.
//! They do NOT require a running Postgres or any other infrastructure.
//!
//! Run with:
//!     cd shadow/shadow-desktop/src-tauri && cargo test --test cortex_sidecar_e2e
//!
//! What we verify:
//! 1. `resolve_cortex_binary()` honours CORTEX_BIN env var (and falls back
//!    when the path does not exist).
//! 2. `start_with_binary()` against a *successful* stand-in (binds a TCP
//!    port and serves /.well-known/agent.json) reaches `Running` status
//!    and `wait_for_ready()` returns Ok.
//! 3. `start_with_binary()` against a *failing* stand-in (exits immediately
//!    with an error) is detected: status flips to `Error`, the error
//!    message contains the captured stderr tail, and `start()` returns Err.
//! 4. `start_with_binary()` against a *bind-then-exit* stand-in (binds
//!    port but then exits) is detected as exited-before-ready.
//! 5. `stop()` kills the running child and clears the state.

use std::time::Duration;
use tokio::io::AsyncWriteExt;

use shadow_desktop_lib::cortex_manager::{
    resolve_cortex_binary, CortexManager, CortexStatus,
};

static TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn test_serial() -> tokio::sync::MutexGuard<'static, ()> {
    TEST_LOCK.lock().await
}

/// Write a shell script to a temp file, return its path. The script is
/// `chmod +x`'d. Caller is responsible for cleaning up the file (we let
/// the OS clean /tmp on reboot).
fn write_fake_cortex(name: &str, body: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join("shadow_desktop_cortex_tests");
    std::fs::create_dir_all(&dir).expect("create temp dir");
    let path = dir.join(name);
    let content = format!("#!/usr/bin/env bash\nset -e\n{body}\n");
    std::fs::write(&path, content).expect("write fake cortex");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perm = std::fs::metadata(&path).expect("stat").permissions();
        perm.set_mode(0o755);
        std::fs::set_permissions(&path, perm).expect("chmod");
    }
    path
}

/// Spawn a tiny HTTP server on the given port that responds 200 OK with
/// the supplied JSON body at GET /.well-known/agent.json. Stays alive
/// until killed.
fn fake_cortex_success_script(port: u16) -> std::path::PathBuf {
    let agent_json = r#"{"name":"test-cortex","version":"0.0.1","description":"fake"}"#;
    let port_str = port.to_string();
    write_fake_cortex(
        "fake_cortex_success.sh",
        &format!(
            r#"
trap 'kill 0' EXIT
AGENT_JSON='{agent_json}'
LISTEN_PORT='{port_str}'
if command -v python3 >/dev/null 2>&1; then
  PORT="$LISTEN_PORT" BODY="$AGENT_JSON" python3 <<'PY'
import os, http.server, socketserver
body = os.environ['BODY'].encode()
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/.well-known/agent.json':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404); self.end_headers()
    def log_message(self, *a, **k): pass
port = int(os.environ['PORT'])
with socketserver.TCPServer(('127.0.0.1', port), H) as s:
    s.serve_forever()
PY
elif command -v node >/dev/null 2>&1; then
  PORT="$LISTEN_PORT" BODY="$AGENT_JSON" node <<'JS'
const http = require('http');
const port = parseInt(process.env.PORT, 10);
const body = process.env.BODY;
http.createServer((req, res) => {{
  if (req.url === '/.well-known/agent.json') {{
    res.writeHead(200, {{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}});
    res.end(body);
  }} else {{
    res.writeHead(404); res.end();
  }}
}}).listen(port, '127.0.0.1');
JS
else
  echo 'no python3 or node available' >&2
  exit 2
fi
"#
        ),
    )
}

/// Fake cortex that exits immediately with an error message on stderr.
fn fake_cortex_immediate_exit_script() -> std::path::PathBuf {
    write_fake_cortex(
        "fake_cortex_exit.sh",
        r#"
echo 'fake cortex: database connection refused (simulated)' >&2
echo 'LANCE_URI=lance:///nonexistent connect failed' >&2
exit 7
"#,
    )
}

/// Fake cortex that binds a port but then exits cleanly after 50ms.
fn fake_cortex_bind_then_exit_script(port: u16) -> std::path::PathBuf {
    let port_str = port.to_string();
    write_fake_cortex(
        "fake_cortex_bind_exit.sh",
        &format!(
            r#"
LISTEN_PORT='{port_str}'
if command -v python3 >/dev/null 2>&1; then
  PORT="$LISTEN_PORT" python3 <<'PY'
import os, socket, time
s = socket.socket()
s.bind(('127.0.0.1', int(os.environ['PORT'])))
s.listen(1)
time.sleep(0.05)
print('bound then exiting', flush=True)
PY
elif command -v node >/dev/null 2>&1; then
  PORT="$LISTEN_PORT" node <<'JS'
const net = require('net');
const s = net.createServer();
s.listen(parseInt(process.env.PORT, 10), '127.0.0.1', () => {{
  setTimeout(() => process.exit(0), 50);
}});
JS
fi
echo 'fake cortex: bound port but exiting immediately' >&2
exit 0
"#
        ),
    )
}

/// Pick a free TCP port by binding then dropping a listener.
fn pick_free_port() -> u16 {
    portpicker::pick_unused_port().expect("portpicker: no free port")
}

fn set_cortex_bin_env(path: &std::path::Path) {
    // SAFETY: tests in the same process cannot race on env vars in a
    // meaningful way here; each test runs sequentially with #[serial]
    // gating if needed.
    unsafe { std::env::set_var("CORTEX_BIN", path) };
}

fn clear_cortex_bin_env() {
    unsafe { std::env::remove_var("CORTEX_BIN") };
}

#[tokio::test]
async fn resolve_cortex_binary_honours_cortex_bin_env() {
    let fake = write_fake_cortex("resolve_cortex_envtest.sh", "exit 0");
    set_cortex_bin_env(&fake);
    let resolved = resolve_cortex_binary();
    assert_eq!(resolved, fake, "CORTEX_BIN should be respected when it exists");
    clear_cortex_bin_env();
}

#[tokio::test]
async fn resolve_cortex_binary_falls_back_when_env_points_to_missing_file() {
    let missing = std::path::PathBuf::from("/nonexistent/cortex-binary-xyz");
    set_cortex_bin_env(&missing);
    let resolved = resolve_cortex_binary();
    // Should not return the missing path; either found another path or
    // returned bare "cortex" PATH fallback.
    assert_ne!(
        resolved, missing,
        "should fall back when CORTEX_BIN points to a missing file"
    );
    clear_cortex_bin_env();
}

#[tokio::test]
async fn start_with_success_standin_reaches_ready_and_running() {
    let _serial = test_serial().await;

    let port = pick_free_port();
    let fake = fake_cortex_success_script(port);
    let manager = CortexManager::with_port(port);

    manager
        .start_with_binary(fake.clone())
        .await
        .expect("start should succeed when stand-in binds and serves");

    let status = manager.status_json().await.expect("status_json");
    assert_eq!(
        status.get("status").and_then(|v| v.as_str()),
        Some("running"),
        "status should be running; got {status:?}"
    );

    // Verify the manager's health check passes
    let health: serde_json::Value = manager.health().await.expect("health");
    assert_eq!(
        health.get("status").and_then(|v| v.as_str()),
        Some("healthy"),
        "health check should reach the stand-in; got {health:?}"
    );

    manager.stop().await.expect("stop should succeed");
    clear_cortex_bin_env();
}

#[tokio::test]
async fn start_with_immediate_exit_standin_reports_error_with_stderr() {
    let _serial = test_serial().await;

    let port = pick_free_port();
    let fake = fake_cortex_immediate_exit_script();
    let manager = CortexManager::with_port(port);

    let err = manager
        .start_with_binary(fake.clone())
        .await
        .expect_err("start should fail when stand-in exits immediately");
    let msg = err.to_lowercase();
    assert!(
        msg.contains("cortex") && (msg.contains("exited") || msg.contains("spawn") || msg.contains("ready")),
        "error should mention cortex and exit/ready/spawn; got: {err}"
    );

    let status: serde_json::Value = manager.status_json().await.expect("status_json");
    assert_eq!(
        status.get("status").and_then(|v| v.as_str()),
        Some("error"),
        "status should be error after immediate exit; got {status:?}"
    );

    let stderr_tail = status
        .get("stderr_tail")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    assert!(
        stderr_tail.contains("database connection refused")
            || stderr_tail.contains("LANCE_URI"),
        "stderr should be captured; got: {stderr_tail}"
    );

    clear_cortex_bin_env();
}

#[tokio::test]
async fn start_with_bind_then_exit_standin_detected_as_exited() {
    let _serial = test_serial().await;

    let port = pick_free_port();
    let fake = fake_cortex_bind_then_exit_script(port);
    let manager = CortexManager::with_port(port);

    // give the port a moment to be released by the exit
    let err = manager
        .start_with_binary(fake.clone())
        .await
        .expect_err("start should fail when stand-in binds then exits");
    let msg = err.to_lowercase();
    assert!(
        msg.contains("exited") || msg.contains("ready"),
        "error should mention exited or ready; got: {err}"
    );

    clear_cortex_bin_env();
}

#[tokio::test]
async fn stop_clears_state_after_running() {
    let _serial = test_serial().await;

    let port = pick_free_port();
    let fake = fake_cortex_success_script(port);
    let manager = CortexManager::with_port(port);

    manager.start_with_binary(fake.clone()).await.expect("start");
    manager.stop().await.expect("stop");

    let status: serde_json::Value = manager.status_json().await.expect("status_json");
    assert_eq!(
        status.get("status").and_then(|v| v.as_str()),
        Some("stopped"),
        "status should be stopped after stop(); got {status:?}"
    );

    clear_cortex_bin_env();
}

#[tokio::test]
async fn start_is_idempotent_while_running() {
    let _serial = test_serial().await;

    let port = pick_free_port();
    let fake = fake_cortex_success_script(port);
    let manager = CortexManager::with_port(port);

    manager.start_with_binary(fake.clone()).await.expect("first start");
    // Second start while running should be a no-op success
    manager.start_with_binary(fake.clone()).await.expect("second start (no-op)");

    let status: serde_json::Value = manager.status_json().await.expect("status_json");
    assert_eq!(
        status.get("status").and_then(|v| v.as_str()),
        Some("running")
    );

    manager.stop().await.expect("stop");
    clear_cortex_bin_env();
}

#[tokio::test]
async fn status_json_includes_stderr_tail_after_failure() {
    let _serial = test_serial().await;

    let port = pick_free_port();
    let fake = fake_cortex_immediate_exit_script();
    let manager = CortexManager::with_port(port);

    let _ = manager.start_with_binary(fake.clone()).await;
    let tail = manager.stderr_tail(2048).await;
    assert!(
        tail.contains("database connection refused"),
        "stderr_tail accessor should expose the captured stderr; got: {tail}"
    );

    clear_cortex_bin_env();
}

// Suppress unused-warning for status enum in case all non-failure tests
// don't reference it directly.
#[allow(dead_code)]
fn _status_eq(a: CortexStatus, b: CortexStatus) -> bool {
    a == b
}

#[allow(dead_code)]
async fn _unused_async_helper() {
    let mut buf = Vec::<u8>::new();
    buf.write_all(b"x").await.ok();
    let _ = Duration::from_millis(0);
}