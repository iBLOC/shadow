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

/// Workflow-as-mental-set fetch: GET `<base>/api/flows/traces?limit=50`
/// and format a compact hint string from rows whose `intent_signature`
/// matches `<agent_name>:<task_id>` and `quality_score >= 0.5`. Rows are
/// sorted by quality desc, truncated to the top 3. Failures log a
/// warning and return an empty string — the bench still runs without
/// hints. The intent_signature format is fixed at ingestion time
/// (see `--trace-url` writer in this binary).
async fn fetch_prior_hint(
    base: &str,
    agent_name: &str,
    task_id: &str,
) -> String {
    let url = format!(
        "{}/api/flows/traces?limit=50",
        base.trim_end_matches('/')
    );
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("prior client build failed: {e}");
            return String::new();
        }
    };
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("prior fetch error ({agent_name}/{task_id}): {e}");
            return String::new();
        }
    };
    let rows: Vec<serde_json::Value> = match resp.json().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("prior parse error ({agent_name}/{task_id}): {e}");
            return String::new();
        }
    };
    let want = format!("{agent_name}:{task_id}");
    let mut matched: Vec<&serde_json::Value> = rows
        .iter()
        .filter(|r| r.get("intent_signature").and_then(|s| s.as_str()) == Some(want.as_str()))
        .filter(|r| r.get("quality_score").and_then(|q| q.as_f64()).unwrap_or(0.0) >= 0.5)
        .collect();
    matched.sort_by(|a, b| {
        b.get("quality_score")
            .and_then(|q| q.as_f64())
            .unwrap_or(0.0)
            .partial_cmp(
                &a.get("quality_score")
                    .and_then(|q| q.as_f64())
                    .unwrap_or(0.0),
            )
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    matched.truncate(3);
    // Delegate rendering to the library function so the unit tests
    // cover both the bench-binary path and any future embedder.
    shadow_benchmark::format_prior_hint(&matched)
}

#[cfg(test)]
mod format_prior_hint_inline_tests {
    // The formatter lives in the library; the binary only fetches and
    // delegates. A stale `super::` import here broke `cargo test
    // --bins` outright.
    use shadow_benchmark::format_prior_hint;
    use serde_json::json;
    // Smoke test to keep the bench-binary inline path honest even
    // if the lib test is skipped by `--lib` vs `--bins`. The lib-side
    // tests in `lib.rs` are the canonical regression net.
    #[test]
    fn inline_empty_is_empty() {
        let empty: Vec<&serde_json::Value> = vec![];
        assert_eq!(format_prior_hint(&empty), "");
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let command = args.get(1).cloned().unwrap_or_else(|| "run".to_string());
    match command.as_str() {
        "run" => run_suite(&args),
        "tau2" => run_tau2(&args),
        "tau2-import" => run_tau2_import(&args),
        "swe" => run_swe(&args),
        "swe-import" => run_swe_import(&args),
        "gaia-import" => run_gaia_import(&args),
        "tb-import" => run_tb_import(&args),
        other => {
            eprintln!(
                "unknown command: {other}\n\
                 usage:\n  \
                 bench run  --suite <json> --agents <toml> [--only a,b] [--repeat k] \
                 [--timeout secs] [--concurrency n] [--out dir] [--prior-trace-url <url>]\n  \
                 bench tau2 --suite <json> --agents <toml> [--only a,b] [--repeat k] \
                 [--timeout secs] [--out dir] [--tau2-root <path>] \
                 [--agent-mode replay|llm] [--user-mode scripted|llm] [--shadow-addendum]\n  \
                 bench tau2-import --from <tau2-root-or-tasks.json> --out <suite.json> \
                 [--domain airline] [--ids 3,7,11] [--name <suite>] [--max-steps 40]\n  \
                 bench swe --suite <json> --agents <toml> [--only a,b] [--repeat k] \
                 [--out dir] [--native] [--gold]\n  \
                 bench swe-import --from <rows.json> --out <suite.json> [--ids a,b] [--name <suite>]\n  \
                 bench gaia-import --from <rows.json> --out <suite.json> [--levels 1,2] [--text-only]\n  \
                 bench tb-import --from <task-dir> --out <suite.json> [--name <suite>]"
            );
            std::process::exit(2);
        }
    }
}

/// SWE-bench Verified: the upstream harness owns the repo checkout and
/// the test oracle, so this path drives the Python driver (or the
/// Rust-native evaluator) per instance.
fn run_swe(args: &[String]) {
    use shadow_benchmark::swe::{SweRunConfig, SweSuite};

    let mut suite_path: Option<PathBuf> = None;
    let mut agents_path: Option<PathBuf> = None;
    let mut only: Option<Vec<String>> = None;
    let mut tasks: Option<Vec<String>> = None;
    let mut repeat = 1usize;
    let mut timeout_secs = 1800u64;
    let mut out_dir = PathBuf::from("reports");
    let mut driver = PathBuf::from("tools/swe_driver.py");
    let mut work_root = PathBuf::from(".swe-work");
    let mut python = "python".to_string();
    let mut native = false;
    let mut gold = false;

    let mut i = 2;
    while i < args.len() {
        let next = |i: &mut usize| -> String {
            *i += 1;
            args.get(*i).cloned().unwrap_or_else(|| {
                eprintln!("missing value for {}", args[*i - 1]);
                std::process::exit(2);
            })
        };
        match args[i].as_str() {
            "swe" => {}
            "--suite" => suite_path = Some(PathBuf::from(next(&mut i))),
            "--agents" => agents_path = Some(PathBuf::from(next(&mut i))),
            "--only" => {
                let v = next(&mut i);
                only = Some(v.split(',').map(str::trim).map(String::from).collect());
            }
            "--tasks" => {
                let v = next(&mut i);
                tasks = Some(v.split(',').map(str::trim).map(String::from).collect());
            }
            "--repeat" => repeat = next(&mut i).parse().expect("--repeat <k>"),
            "--timeout" => timeout_secs = next(&mut i).parse().expect("--timeout <secs>"),
            "--out" => out_dir = PathBuf::from(next(&mut i)),
            "--driver" => driver = PathBuf::from(next(&mut i)),
            "--work-root" => work_root = PathBuf::from(next(&mut i)),
            "--python" => python = next(&mut i),
            "--native" => native = true,
            "--gold" => gold = true,
            other => {
                eprintln!("unknown arg: {other}");
                std::process::exit(2);
            }
        }
        i += 1;
    }

    let suite_path = suite_path.expect("--suite <json> required");
    let mut suite = SweSuite::load(&suite_path).unwrap_or_else(|e| {
        eprintln!("swe suite load failed: {e}");
        std::process::exit(1);
    });
    if let Some(ids) = &tasks {
        suite.instances.retain(|i| ids.iter().any(|x| x == &i.instance_id));
    }
    println!(
        "swe suite '{}' — {} instances, repeat={repeat}{}",
        suite.name,
        suite.instances.len(),
        if native { ", native eval" } else { "" }
    );

    // Participants: the shared agents.toml, openai variant only.
    let mut agents: Vec<shadow_benchmark::agent::OpenAiAgent> = Vec::new();
    if !gold {
        let agents_path = agents_path.expect("--agents <toml> required (or use --gold)");
        let cfg_raw = shadow_benchmark::AgentsConfig::load(&agents_path).unwrap_or_else(|e| {
            eprintln!("agents config failed: {e}");
            std::process::exit(1);
        });
        for spec in &cfg_raw.agents {
            if let Some(names) = &only {
                if !names.iter().any(|n| n == spec.name()) {
                    continue;
                }
            }
            if let shadow_benchmark::AgentSpec::OpenAi {
                name,
                base_url,
                model,
                api_key,
                api_key_env,
                max_tokens,
                timeout_secs,
                mode,
                ..
            } = spec
            {
                agents.push(shadow_benchmark::agent::OpenAiAgent {
                    name: name.clone(),
                    base_url: base_url.clone(),
                    model: model.clone(),
                    api_key: api_key.clone(),
                    api_key_env: api_key_env.clone(),
                    max_tokens: *max_tokens,
                    timeout_secs: *timeout_secs,
                    mode: mode.clone(),
                });
            }
        }
        if agents.is_empty() {
            eprintln!("no agents selected (check --only and agents.toml)");
            std::process::exit(1);
        }
        println!(
            "agents: {:?}",
            agents.iter().map(|a| a.name.clone()).collect::<Vec<_>>()
        );
    }

    let driver = if driver.is_absolute() || driver.exists() {
        driver
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(driver)
    };

    let cfg = SweRunConfig {
        driver,
        work_root,
        python,
        repeat,
        timeout: Duration::from_secs(timeout_secs),
        test_timeout: None,
        native,
    };

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .expect("tokio runtime");

    runtime.block_on(async move {
        let report = shadow_benchmark::swe::run(&suite, &agents, &cfg, gold, None).await;
        let json_path = out_dir.join(format!("{}-report.json", suite.name));
        let md_path = out_dir.join(format!("{}-report.md", suite.name));
        report.write_json(&json_path).expect("write json");
        report.write_markdown(&md_path).expect("write markdown");

        println!("\n=== summary ===");
        for s in &report.summaries {
            println!(
                "{:<20} passed {:>2}/{:<2} (skip {}) pass^k {:.0}%  median {:.2}s",
                s.agent,
                s.tasks_passed,
                s.tasks_total,
                s.tasks_skipped,
                s.pass_k_rate * 100.0,
                s.median_duration_secs
            );
        }
        println!("\nreport: {} + {}", json_path.display(), md_path.display());
    });
}

/// Freeze SWE-bench Verified instance rows into a shadow suite JSON.
fn run_swe_import(args: &[String]) {
    use shadow_benchmark::swe::SweSuite;
    use shadow_benchmark::swe_import::{import_rows, SweImportOpts};

    let mut from: Option<PathBuf> = None;
    let mut out: Option<PathBuf> = None;
    let mut ids: Vec<String> = Vec::new();
    let mut name = "swe-verified-smoke".to_string();
    let mut source = String::new();

    let mut i = 2;
    while i < args.len() {
        let next = |i: &mut usize| -> String {
            *i += 1;
            args.get(*i).cloned().unwrap_or_else(|| {
                eprintln!("missing value for {}", args[*i - 1]);
                std::process::exit(2);
            })
        };
        match args[i].as_str() {
            "swe-import" => {}
            "--from" => from = Some(PathBuf::from(next(&mut i))),
            "--out" => out = Some(PathBuf::from(next(&mut i))),
            "--ids" => {
                let v = next(&mut i);
                ids = v
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .collect();
            }
            "--name" => name = next(&mut i),
            "--source" => source = next(&mut i),
            other => {
                eprintln!("unknown arg: {other}");
                std::process::exit(2);
            }
        }
        i += 1;
    }

    let from = from.expect("--from <rows.json> required");
    let out = out.expect("--out <suite.json> required");
    let raw = std::fs::read_to_string(&from).unwrap_or_else(|e| {
        eprintln!("cannot read {}: {e}", from.display());
        std::process::exit(1);
    });
    let opts = SweImportOpts {
        name: &name,
        source: &source,
        ids: if ids.is_empty() { None } else { Some(ids.as_slice()) },
    };
    let suite = import_rows(&raw, &opts).unwrap_or_else(|e| {
        eprintln!("swe import failed: {e}");
        std::process::exit(1);
    });
    if let Some(parent) = out.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(&suite).expect("serialize suite");
    std::fs::write(&out, json).unwrap_or_else(|e| {
        eprintln!("cannot write {}: {e}", out.display());
        std::process::exit(1);
    });
    println!(
        "imported {} instances from {} -> {}",
        suite.instances.len(),
        from.display(),
        out.display()
    );
    let _ = SweSuite::load(&out);
}

/// Freeze GAIA rows into a shadow suite JSON.
fn run_gaia_import(args: &[String]) {
    use shadow_benchmark::gaia_import::{import_rows, GaiaImportOpts};

    let mut from: Option<PathBuf> = None;
    let mut out: Option<PathBuf> = None;
    let mut levels: Vec<String> = Vec::new();
    let mut ids: Vec<String> = Vec::new();
    let mut name = "gaia-text-smoke".to_string();
    let mut source = String::new();
    let mut text_only = true;

    let mut i = 2;
    while i < args.len() {
        let next = |i: &mut usize| -> String {
            *i += 1;
            args.get(*i).cloned().unwrap_or_else(|| {
                eprintln!("missing value for {}", args[*i - 1]);
                std::process::exit(2);
            })
        };
        match args[i].as_str() {
            "gaia-import" => {}
            "--from" => from = Some(PathBuf::from(next(&mut i))),
            "--out" => out = Some(PathBuf::from(next(&mut i))),
            "--levels" => {
                let v = next(&mut i);
                levels = v
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .collect();
            }
            "--ids" => {
                let v = next(&mut i);
                ids = v
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .collect();
            }
            "--name" => name = next(&mut i),
            "--source" => source = next(&mut i),
            "--all" => text_only = false,
            other => {
                eprintln!("unknown arg: {other}");
                std::process::exit(2);
            }
        }
        i += 1;
    }

    let from = from.expect("--from <rows.json> required");
    let out = out.expect("--out <suite.json> required");
    let raw = std::fs::read_to_string(&from).unwrap_or_else(|e| {
        eprintln!("cannot read {}: {e}", from.display());
        std::process::exit(1);
    });
    let opts = GaiaImportOpts {
        name: &name,
        source: &source,
        levels: if levels.is_empty() { None } else { Some(levels.as_slice()) },
        ids: if ids.is_empty() { None } else { Some(ids.as_slice()) },
        text_only,
    };
    let suite = import_rows(&raw, &opts).unwrap_or_else(|e| {
        eprintln!("gaia import failed: {e}");
        std::process::exit(1);
    });
    if let Some(parent) = out.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(&suite).expect("serialize suite");
    std::fs::write(&out, json).unwrap_or_else(|e| {
        eprintln!("cannot write {}: {e}", out.display());
        std::process::exit(1);
    });
    println!(
        "imported {} tasks from {} -> {}",
        suite.tasks.len(),
        from.display(),
        out.display()
    );
}

/// Freeze one Terminal-Bench task directory into a shadow suite JSON.
fn run_tb_import(args: &[String]) {
    use shadow_benchmark::tb_import::import_task;

    let mut from: Option<PathBuf> = None;
    let mut out: Option<PathBuf> = None;
    let mut name = "terminal-bench-smoke".to_string();

    let mut i = 2;
    while i < args.len() {
        let next = |i: &mut usize| -> String {
            *i += 1;
            args.get(*i).cloned().unwrap_or_else(|| {
                eprintln!("missing value for {}", args[*i - 1]);
                std::process::exit(2);
            })
        };
        match args[i].as_str() {
            "tb-import" => {}
            "--from" => from = Some(PathBuf::from(next(&mut i))),
            "--out" => out = Some(PathBuf::from(next(&mut i))),
            "--name" => name = next(&mut i),
            other => {
                eprintln!("unknown arg: {other}");
                std::process::exit(2);
            }
        }
        i += 1;
    }

    let from = from.expect("--from <task-dir> required");
    let out = out.expect("--out <suite.json> required");
    let imported = import_task(&from).unwrap_or_else(|e| {
        eprintln!("tb import failed: {e}");
        std::process::exit(1);
    });
    let suite = shadow_benchmark::Suite {
        name,
        description: String::new(),
        tasks: vec![imported.task.clone()],
    };
    if let Some(parent) = out.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(&suite).expect("serialize suite");
    std::fs::write(&out, json).unwrap_or_else(|e| {
        eprintln!("cannot write {}: {e}", out.display());
        std::process::exit(1);
    });
    println!(
        "imported task '{}' from {} -> {}",
        imported.task.id,
        from.display(),
        out.display()
    );
}

/// Freeze upstream τ² task records into a shadow suite JSON.
///
/// `--from` accepts either a pinned τ² checkout (the tasks file is
/// then `<root>/data/tau2/domains/<domain>/tasks.json`) or the
/// tasks file itself. The output is a self-contained suite: the
/// upstream checkout is needed only to RUN it.
fn run_tau2_import(args: &[String]) {
    use shadow_benchmark::tau2::import_tasks;

    let mut from: Option<PathBuf> = None;
    let mut out: Option<PathBuf> = None;
    let mut domain = "airline".to_string();
    let mut ids: Vec<String> = Vec::new();
    let mut name: Option<String> = None;
    let mut max_steps = 40u32;
    let mut source = String::new();

    let mut i = 2;
    while i < args.len() {
        let next = |i: &mut usize| -> String {
            *i += 1;
            args.get(*i).cloned().unwrap_or_else(|| {
                eprintln!("missing value for {}", args[*i - 1]);
                std::process::exit(2);
            })
        };
        match args[i].as_str() {
            "tau2-import" => {}
            "--from" => from = Some(PathBuf::from(next(&mut i))),
            "--out" => out = Some(PathBuf::from(next(&mut i))),
            "--domain" => domain = next(&mut i),
            "--ids" => {
                let v = next(&mut i);
                ids = v
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .collect();
            }
            "--name" => name = Some(next(&mut i)),
            "--max-steps" => max_steps = next(&mut i).parse().expect("--max-steps <n>"),
            "--source" => source = next(&mut i),
            other => {
                eprintln!("unknown arg: {other}");
                std::process::exit(2);
            }
        }
        i += 1;
    }

    let from = from.expect("--from <tau2-root-or-tasks.json> required");
    let out = out.expect("--out <suite.json> required");

    // A checkout root carries `data/tau2/domains/<domain>/tasks.json`;
    // a direct file is used as-is.
    let tasks_path = if from.is_file() {
        from.clone()
    } else {
        from.join("data")
            .join("tau2")
            .join("domains")
            .join(&domain)
            .join("tasks.json")
    };
    if !tasks_path.exists() {
        eprintln!("upstream tasks file not found: {}", tasks_path.display());
        std::process::exit(1);
    }

    let suite_name = name.unwrap_or_else(|| format!("tau2-{domain}-smoke"));
    let suite = import_tasks(&tasks_path, &suite_name, &domain, &ids, &source, max_steps)
        .unwrap_or_else(|e| {
            eprintln!("tau2 import failed: {e}");
            std::process::exit(1);
        });

    if let Some(parent) = out.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(&suite).expect("serialize suite");
    std::fs::write(&out, json).unwrap_or_else(|e| {
        eprintln!("cannot write {}: {e}", out.display());
        std::process::exit(1);
    });
    println!(
        "imported {} tasks from {} -> {} (domain {}, max_steps {})",
        suite.tasks.len(),
        tasks_path.display(),
        out.display(),
        suite.domain,
        suite.max_steps
    );
}

/// τ²-bench: the upstream harness owns the orchestrator, the user
/// simulator and the DB-vs-gold evaluator, so this path drives the
/// Python driver per task instead of the Rust runner. The suite JSON
/// holds frozen τ² task records; the pinned checkout under
/// `--tau2-root` supplies the environment.
fn run_tau2(args: &[String]) {
    use shadow_benchmark::tau2::{self, Tau2Agent, Tau2RunConfig, Tau2Suite};

    let mut suite_path: Option<PathBuf> = None;
    let mut agents_path: Option<PathBuf> = None;
    let mut only: Option<Vec<String>> = None;
    let mut tasks: Option<Vec<String>> = None;
    let mut repeat = 1usize;
    let mut timeout_secs = 900u64;
    let mut out_dir = PathBuf::from("reports");
    let mut tau2_root = PathBuf::from(".tau2");
    let mut driver = PathBuf::from("tools/tau2_driver.py");
    let mut agent_mode = "llm".to_string();
    let mut user_mode = "scripted".to_string();
    let mut shadow_addendum = false;
    let mut save_dir: Option<PathBuf> = None;
    let mut user_model: Option<String> = None;
    let mut user_api_base: Option<String> = None;
    let mut user_api_key_env: Option<String> = None;
    let mut verify = false;

    let mut i = 2; // skip the "tau2" subcommand
    while i < args.len() {
        let next = |i: &mut usize| -> String {
            *i += 1;
            args.get(*i).cloned().unwrap_or_else(|| {
                eprintln!("missing value for {}", args[*i - 1]);
                std::process::exit(2);
            })
        };
        match args[i].as_str() {
            "tau2" => {}
            "--suite" => suite_path = Some(PathBuf::from(next(&mut i))),
            "--agents" => agents_path = Some(PathBuf::from(next(&mut i))),
            "--only" => {
                let v = next(&mut i);
                only = Some(v.split(',').map(str::trim).map(String::from).collect());
            }
            "--tasks" => {
                let v = next(&mut i);
                tasks = Some(v.split(',').map(str::trim).map(String::from).collect());
            }
            "--repeat" => repeat = next(&mut i).parse().expect("--repeat <k>"),
            "--timeout" => timeout_secs = next(&mut i).parse().expect("--timeout <secs>"),
            "--out" => out_dir = PathBuf::from(next(&mut i)),
            "--tau2-root" => tau2_root = PathBuf::from(next(&mut i)),
            "--driver" => driver = PathBuf::from(next(&mut i)),
            "--agent-mode" => agent_mode = next(&mut i),
            "--user-mode" => user_mode = next(&mut i),
            "--user-model" => user_model = Some(next(&mut i)),
            "--user-api-base" => user_api_base = Some(next(&mut i)),
            "--user-api-key-env" => user_api_key_env = Some(next(&mut i)),
            "--save-dir" => save_dir = Some(PathBuf::from(next(&mut i))),
            "--shadow-addendum" => shadow_addendum = true,
            "--verify" => verify = true,
            other => {
                eprintln!("unknown arg: {other}");
                std::process::exit(2);
            }
        }
        i += 1;
    }

    let suite_path = suite_path.expect("--suite <json> required");
    let agents_path = agents_path.expect("--agents <toml> required");

    let mut suite = Tau2Suite::load(&suite_path).unwrap_or_else(|e| {
        eprintln!("tau2 suite load failed: {e}");
        std::process::exit(1);
    });
    if let Some(ids) = &tasks {
        suite.tasks.retain(|t| {
            let id = Tau2Suite::task_id(t).unwrap_or_default();
            ids.iter().any(|x| x == &id)
        });
    }
    println!(
        "tau2 suite '{}' (domain {}) — {} tasks, repeat={repeat}",
        suite.name,
        suite.domain,
        suite.tasks.len()
    );

    let cfg_raw = shadow_benchmark::AgentsConfig::load(&agents_path).unwrap_or_else(|e| {
        eprintln!("agents config failed: {e}");
        std::process::exit(1);
    });
    let mut tau2_agents: Vec<Tau2Agent> = Vec::new();
    for spec in &cfg_raw.agents {
        if let Some(names) = &only {
            if !names.iter().any(|n| n == spec.name()) {
                continue;
            }
        }
        match Tau2Agent::from_spec(spec) {
            Ok(a) => tau2_agents.push(a),
            Err(e) => eprintln!("skipping agent: {e}"),
        }
    }
    if tau2_agents.is_empty() {
        eprintln!("no agents selected (check --only and agents.toml)");
        std::process::exit(1);
    }
    if verify {
        // Oracle mode: the replay agent re-enacts the task's golden
        // actions, so the model and its key are irrelevant. The run
        // therefore validates the harness itself (driver, domain
        // state machine, DB-vs-gold evaluator) rather than any
        // model under test.
        agent_mode = "replay".to_string();
        for a in tau2_agents.iter_mut() {
            a.api_key = None;
            a.api_key_env = None;
        }
        println!("verify mode: replay oracle (no model, no API key)");
    }
    println!(
        "agents: {:?}",
        tau2_agents.iter().map(|a| a.name.clone()).collect::<Vec<_>>()
    );

    // The driver path is resolved relative to the bench crate root so
    // the command works from the repo root too.
    let driver = if driver.is_absolute() || driver.exists() {
        driver
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(driver)
    };

    let cfg = Tau2RunConfig {
        tau2_root,
        driver,
        agent_mode,
        user_mode,
        repeat,
        timeout: Duration::from_secs(timeout_secs),
        save_dir,
        shadow_addendum,
        user_model,
        user_api_base,
        user_api_key_env,
    };

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .expect("tokio runtime");

    runtime.block_on(async move {
        let report = tau2::run(&suite, &tau2_agents, &cfg, suite.max_steps, None).await;
        let json_path = out_dir.join(format!("{}-report.json", suite.name));
        let md_path = out_dir.join(format!("{}-report.md", suite.name));
        report.write_json(&json_path).expect("write json");
        report.write_markdown(&md_path).expect("write markdown");

        println!("\n=== summary ===");
        for s in &report.summaries {
            println!(
                "{:<20} passed {:>2}/{:<2} (skip {}) pass^k {:.0}%  median {:.2}s",
                s.agent,
                s.tasks_passed,
                s.tasks_total,
                s.tasks_skipped,
                s.pass_k_rate * 100.0,
                s.median_duration_secs
            );
        }
        println!("\nreport: {} + {}", json_path.display(), md_path.display());

        if verify {
            // The oracle is the harness's own regression net: every
            // task must pass, otherwise the failure is in the driver,
            // the domain state machine or the evaluator — not in the
            // model under test.
            let mut passed = 0usize;
            let mut total = 0usize;
            for r in &report.results {
                for run in &r.runs {
                    total += 1;
                    if run.passed {
                        passed += 1;
                    } else {
                        println!("oracle FAIL task {}: {}", r.task_id, run.detail);
                    }
                }
            }
            println!("\noracle: {passed}/{total} tasks pass");
            if passed != total || total == 0 {
                eprintln!("harness verification FAILED — the tau2 oracle must pass every task");
                std::process::exit(1);
            }
            println!("harness verification OK");
        }
    });
}

fn run_suite(args: &[String]) {
    let args: Vec<String> = args.to_vec();
    let mut suite_path: Option<PathBuf> = None;
    let mut agents_path: Option<PathBuf> = None;
    let mut only: Option<Vec<String>> = None;
    let mut repeat = 1usize;
    let mut out_dir = PathBuf::from("reports");
    let mut timeout_secs: Option<u64> = None;
    let mut concurrency = 4usize;
    let mut tasks: Option<Vec<String>> = None;
    let mut prior_trace_url: Option<String> = None;

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
            "--prior-trace-url" => {
                // Workflow-as-mental-set fetch. When set, the runner
                // queries <url>/api/flows/traces for every (agent,
                // task) pair, filters by intent_signature and
                // quality_score >= 0.5, and injects a compact
                // "successful past trajectories" hint into the agent
                // system prompt before each run.
                i += 1;
                prior_trace_url = Some(args[i].to_string());
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

        // Workflow-as-mental-set fetch: for every (agent, task) pair,
        // query telencephalon's flow trace endpoint and format the
        // top-N successful prior trajectories. Best-effort: any
        // network error logs a warning and proceeds with an empty
        // map (the runner still runs, just without hints).
        let mut prior_traces: std::collections::HashMap<(String, String), String> =
            std::collections::HashMap::new();
        if let Some(base) = prior_trace_url.as_deref() {
            for adapter in &adapters {
                for task in &suite.tasks {
                    let hint = fetch_prior_hint(base, adapter.name(), &task.id).await;
                    if !hint.is_empty() {
                        prior_traces
                            .insert((adapter.name().to_string(), task.id.clone()), hint);
                    }
                }
            }
        }

        let report = runner.run(&suite, &adapters, &cfg_raw, &prior_traces).await;

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
