//! Agent benchmark harness — the comparison substrate for the Shadow
//! platform.
//!
//! Industry agent benchmarks (SWE-bench, Terminal-Bench, GAIA, τ-bench,
//! OSWorld) all share the same skeleton: a task set, an agent under
//! test, an environment to run the agent in, and a scorer. This crate
//! implements that skeleton locally so the platform can
//!
//! * regression-test its own agents (embedded neuron, future A2A
//!   agents) in CI;
//! * compare against external open-source agents (openclaw, pi,
//!   DeepSeek Harness `dsh`, aider, …) driven as CLI processes;
//! * score answers exactly (exact-match / contains), behaviorally
//!   (unit tests in the task sandbox) or with an LLM judge;
//! * report the τ-bench-style **pass^k** reliability metric by
//!   repeating every task k times.
//!
//! Layout: [`task::Task`] + [`suite::Suite`] describe WHAT to run;
//! [`agent`] adapters describe HOW to drive an agent; [`scorer`]
//! decides pass/fail; [`runner::Runner`] produces a [`runner::Report`]
//! with JSON + markdown exports. The `bench` binary ties it together.

pub mod agent;
pub mod config;
pub mod desktop_agent;
pub mod runner;
pub mod scorer;
pub mod suite;
pub mod task;

pub use agent::{AgentAdapter, AgentError, AgentRun, CliAgent, OpenAiAgent};
pub use config::{AgentSpec, AgentsConfig, JudgeConfig};
pub use runner::{AgentSummary, Report, Runner, RunnerConfig, TaskResult};
pub use suite::Suite;
pub use task::{ScorerSpec, Task, TaskFile};
