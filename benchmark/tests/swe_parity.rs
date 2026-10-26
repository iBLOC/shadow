//! Double-run parity harness: every gold-oracle instance is evaluated
//! TWICE — once by the Python driver (`tools/swe_driver.py`, the
//! original implementation) and once by the native Rust evaluator
//! (`swe_native::evaluate`) — and the two verdicts must agree on
//! `passed` plus the f2p/p2p counts.
//!
//! Requires the per-instance uv venvs under `.swe-work/` (built on
//! first use; the env cache is shared between both drivers, so the
//! second driver hits the same venv). Runtime ≈ 5 min with warm caches.
//!
//! Run: `cargo test --release --test swe_parity -- --ignored`

use shadow_benchmark::swe::SweSuite;

#[tokio::test]
#[ignore = "spawns the real python driver; needs uv + .swe-work caches"]
async fn gold_double_run_python_driver_vs_native() {
    let manifest = env!("CARGO_MANIFEST_DIR");
    let suite = SweSuite::load(std::path::Path::new(&format!(
        "{manifest}/suites/swe-verified-smoke.json"
    )))
    .unwrap();
    let work_root = std::path::PathBuf::from(format!("{manifest}/.swe-work"));
    let python = "python";
    let out_dir = work_root.join("parity");
    std::fs::create_dir_all(&out_dir).unwrap();

    for inst in &suite.instances {
        // --- run 1: the original Python driver -----------------------
        let out_path = out_dir.join(format!("{}-py.json", inst.instance_id));
        let _ = std::fs::remove_file(&out_path);
        let cmd = tokio::process::Command::new(python)
            .arg(format!("{manifest}/tools/swe_driver.py"))
            .arg("--suite")
            .arg(format!("{manifest}/suites/swe-verified-smoke.json"))
            .arg("--task-id")
            .arg(&inst.instance_id)
            .arg("--gold")
            .arg("--out")
            .arg(&out_path)
            .arg("--work-root")
            .arg(&work_root)
            .output()
            .await
            .expect("spawn python driver");
        let raw = std::fs::read_to_string(&out_path)
            .unwrap_or_else(|e| panic!("{}: driver wrote no result ({e})", inst.instance_id));
        let py: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert!(
            cmd.status.success() && py["error"].as_str().is_none(),
            "{}: python driver errored: {:?}",
            inst.instance_id,
            py["error"]
        );
        let py_passed = py["passed"].as_bool().unwrap();

        // --- run 2: the native Rust evaluator ------------------------
        let native = shadow_benchmark::swe_native::evaluate(
            inst,
            shadow_benchmark::swe_native::NativeInput::Gold,
            &work_root,
            1200,
            false,
        )
        .await
        .unwrap_or_else(|e| panic!("{}: native errored: {e}", inst.instance_id));
        assert!(
            native.error.is_none(),
            "{}: native errored: {:?}",
            inst.instance_id,
            native.error
        );

        // --- compare --------------------------------------------------
        assert_eq!(
            py_passed, native.passed,
            "{}: verdict divergence — python {py_passed} vs native {} (native detail: {})",
            inst.instance_id, native.passed, native.detail
        );
        assert_eq!(
            py["f2p_pass"].as_u64(),
            Some(native.f2p_pass as u64),
            "{}: f2p_pass divergence ({})",
            inst.instance_id,
            native.detail
        );
        assert_eq!(
            py["p2p_pass"].as_u64(),
            Some(native.p2p_pass as u64),
            "{}: p2p_pass divergence ({})",
            inst.instance_id,
            native.detail
        );
        println!(
            "PARITY {} — both {}, f2p {}/{} p2p {}/{}",
            inst.instance_id,
            native.passed,
            native.f2p_pass,
            native.f2p_total,
            native.p2p_pass,
            native.p2p_total
        );
    }
}
