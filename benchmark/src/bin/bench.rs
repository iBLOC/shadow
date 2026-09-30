//! bench — CLI entry point.
//!
//! ```text
//! cargo run -p benchmark --bin bench -- run \
//!   --suite crates/benchmark/suites/core-smoke.json \
//!   --agents agents.toml \
//!   [--only shadow-neuron,pi] [--repeat 3] [--out reports/]
//! ```

use shadow_benchmark::{AgentsConfig, Runner, RunnerConfig, Suite};
use std::path::PathBuf;
use std::time::Duration;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut suite_path: Option<PathBuf> = None;
    let mut agents_path: Option<PathBuf> = None;
    let mut only: Option<Vec<String>> = None;
    let mut repeat = 1usize;
    let mut out_dir = PathBuf::from("reports");
    let mut timeout_secs: Option<u64> = None;
    let mut concurrency = 4usize;
    let mut tasks: Option<Vec<String>> = None;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "run" => {}
            "--suite" => {
                i += 1;
                suite_path = Some(PathBuf::from(&args[i]));
            }
            "--agents" => {
                i += 1;
                agents_path = Some(PathBuf::from(&args[i]));
            }
            "--only" => {
                i += 1;
                only = Some(args[i].split(',').map(str::trim).map(String::from).collect());
            }
            "--repeat" => {
                i += 1;
                repeat = args[i].parse().expect("--repeat <k>");
            }
            "--timeout" => {
                i += 1;
                timeout_secs = Some(args[i].parse().expect("--timeout <secs>"));
            }
            "--concurrency" => {
                i += 1;
                concurrency = args[i].parse().expect("--concurrency <n>");
            }
            "--tasks" => {
                i += 1;
                tasks = Some(args[i].split(',').map(str::trim).map(String::from).collect());
            }
            "--out" => {
                i += 1;
                out_dir = PathBuf::from(&args[i]);
            }
            other => {
                eprintln!("unknown arg: {other}\nusage: bench run --suite <json> --agents <toml> [--only a,b] [--repeat k] [--timeout secs] [--concurrency n] [--out dir]");
                std::process::exit(2);
            }
        }
        i += 1;
    }

    let suite_path = suite_path.expect("--suite <json> required");
    let agents_path = agents_path.expect("--agents <toml> required");

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(concurrency.max(1))
        .enable_all()
        .build()
        .expect("tokio runtime");

    runtime.block_on(async move {
        let mut suite = Suite::load(&suite_path).unwrap_or_else(|e| {
            eprintln!("suite load failed: {e}");
            std::process::exit(1);
        });
        if let Some(ids) = &tasks {
            suite.tasks.retain(|t| ids.iter().any(|id| id == &t.id));
            println!("task filter: {:?}", ids);
        }
        println!(
            "suite '{}' — {} tasks, repeat={repeat}",
            suite.name,
            suite.tasks.len()
        );

        let cfg_raw = AgentsConfig::load(&agents_path).unwrap_or_else(|e| {
            eprintln!("agents config failed: {e}");
            std::process::exit(1);
        });
        let adapters = cfg_raw.clone().into_adapters(only.as_deref());
        if adapters.is_empty() {
            eprintln!("no agents selected (check --only and agents.toml)");
            std::process::exit(1);
        }
        println!("agents: {:?}", cfg_raw.agents.iter().map(|a| a.name()).collect::<Vec<_>>());

        let mut rcfg = RunnerConfig::default();
        rcfg.repeat = repeat;
        if let Some(s) = timeout_secs {
            rcfg.timeout_default = Duration::from_secs(s);
        }
        let runner = Runner { cfg: rcfg };

        let report = runner.run(&suite, &adapters, &cfg_raw).await;

        let json_path = out_dir.join(format!("{}-report.json", suite.name));
        let md_path = out_dir.join(format!("{}-report.md", suite.name));
        report.write_json(&json_path).expect("write json");
        report.write_markdown(&md_path).expect("write markdown");

        println!("\n=== summary ===");
        for s in &report.summaries {
            println!(
                "{:<20} passed {:>2}/{:<2} (skip {}) pass^k {:.0}%  median {:.2}s",
                s.agent, s.tasks_passed, s.tasks_total, s.tasks_skipped,
                s.pass_k_rate * 100.0, s.median_duration_secs
            );
        }
        println!("\nreport: {} + {}", json_path.display(), md_path.display());
    });
}
