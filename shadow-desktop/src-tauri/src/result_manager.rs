//! Result management — local git-backed versioning of per-task artifacts.
//!
//! Implements the "成果管理 + 本地 git 仓库" half of WS-01..WS-05 in
//! [`external-agent-website-development-scenario.md`](../../docs/superpowers/scenarios/2026-09-23-external-agent-website-development-scenario.md).
//!
//! Every task (e.g., a 天工 session for a website dev request) gets its
//! own git repository at `<base_dir>/<task_id>/`. 天工 artifact pushes
//! auto-commit incremental progress; `history()` exposes the commit log
//! for the 颞叶 (temporal lobe) UI to render as a timeline (WS-04).
//!
//! # Layout
//!
//! ```text
//! <base_dir>/
//!   └── <task-id>/             # one git repo per task
//!       ├── .git/
//       ├── README.md          # created by init()
//!       └── ...                # 天工 artifacts land here
//! ```
//!
//! # Defaults
//!
//! `base_dir` defaults to `~/.shadow/results/` (resolved via `dirs::home_dir`).
//! Git author is set to `shadow <shadow@iBLOC.local>` so all commits
//! across all tasks are owned by shadow, distinguishing them from
//! any human edits.

use std::fs;
use std::path::{Path, PathBuf};

use git2::{IndexAddOption, Oid, Repository, Signature};
use serde::Serialize;

use crate::task_path;

#[derive(Debug, thiserror::Error)]
pub enum ResultManagerError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("git: {0}")]
    Git(#[from] git2::Error),
    #[error("repo not found for task {0} (call init() first)")]
    NotFound(String),
    #[error("no changes to commit in task {0}")]
    NoChanges(String),
    /// ⚠️ **task id 不是合法的单个目录名** —— 路径穿越的入口。
    ///
    /// 以前 `repo_path` 是裸 `base.join(task_id)` ⇒ `../` 能逃出
    /// `~/.shadow/results/`，Windows 上绝对路径还会**整体替换** base
    /// ⇒ ⇒ 任意目录创建 ＋ 任意文件写。现在一律先过
    /// [`task_path::validate_task_id`]（fail-closed）。
    #[error("invalid task id: {0}")]
    InvalidTaskId(String),
}

/// One commit's metadata — what `history()` returns.
#[derive(Debug, Clone, Serialize)]
pub struct CommitInfo {
    pub id: String,
    pub short_id: String,
    pub author: String,
    /// Commit timestamp as Unix epoch seconds (UTC).
    pub timestamp: i64,
    pub message: String,
}

pub struct ResultManager {
    base_dir: PathBuf,
    author_name: String,
    author_email: String,
}

impl ResultManager {
    /// Construct with an explicit base directory.
    pub fn new(base_dir: impl Into<PathBuf>) -> Self {
        Self {
            base_dir: base_dir.into(),
            author_name: "shadow".into(),
            author_email: "shadow@iBLOC.local".into(),
        }
    }

    /// Construct with the default base directory (`<home>/.shadow/results/`).
    /// The directory is created lazily on first `init()` call.
    pub fn with_default_base_dir() -> Result<Self, ResultManagerError> {
        let base = match_dir()?.join(".shadow").join("results");
        Ok(Self::new(base))
    }

    /// 任务仓库目录 = `base_dir/<task_id>`。
    ///
    /// ⚠️ **task id 先校验**（fail-closed）—— 它是外部输入（Tauri 命令
    /// 入参），裸 join 会让 `../` 逃出 base 目录、Windows 上绝对路径还会
    /// 整体替换 base ⇒ ⇒ 任意目录创建 ＋ 任意文件写。见
    /// [`crate::task_path`]。
    pub fn repo_path(&self, task_id: &str) -> Result<PathBuf, ResultManagerError> {
        task_path::validate_task_id(task_id).map_err(ResultManagerError::InvalidTaskId)?;
        Ok(self.base_dir.join(task_id))
    }

    /// 任务仓库的根目录（`~/.shadow/results/`）。
    ///
    /// ⚠️ 目前只有测试在用（2026-11-08）⇒ 显式豁免并留名（它是这个类型
    /// 的**位置契约**，调用方迟早要问「东西落在哪」）。
    #[allow(dead_code)]
    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    fn signature(&self) -> Result<Signature<'_>, git2::Error> {
        Signature::now(&self.author_name, &self.author_email)
    }

    /// Initialise a new per-task git repo.
    ///
    /// - Creates `<base>/<task_id>/` if absent.
    /// - Runs `git init` inside it.
    /// - Writes a `README.md` describing the task.
    /// - Creates the initial commit so HEAD is valid.
    /// - Idempotent: if the repo already exists, returns the existing
    ///   path without re-initialising.
    pub fn init(&self, task_id: &str, title: &str) -> Result<PathBuf, ResultManagerError> {
        let path = self.repo_path(task_id)?;
        if path.join(".git").exists() {
            return Ok(path);
        }
        fs::create_dir_all(&path)?;
        let repo = Repository::init(&path)?;

        // README — content is what the 颞叶 shows when the user opens
        // the task folder for the first time.
        let readme_path = path.join("README.md");
        let safe_title = title.replace(['\r', '\n'], " ");
        let body = format!("# Shadow task `{task_id}`\n\n{safe_title}\n");
        fs::write(&readme_path, body)?;

        // Initial commit.
        let mut index = repo.index()?;
        index.add_path(Path::new("README.md"))?;
        let oid = index.write_tree()?;
        let tree = repo.find_tree(oid)?;
        let sig = self.signature()?;
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &format!("init: task {task_id}"),
            &tree,
            &[], // no parents — first commit
        )?;
        Ok(path)
    }

    /// Commit every change in the repo's working directory. Returns the
    /// new commit OID. Returns `NoChanges` when the index is clean.
    pub fn commit(&self, task_id: &str, message: &str) -> Result<Oid, ResultManagerError> {
        let path = self.repo_path(task_id)?;
        let repo = Repository::open(&path).map_err(|e| match e.code() {
            git2::ErrorCode::NotFound => ResultManagerError::NotFound(task_id.to_string()),
            _ => ResultManagerError::Git(e),
        })?;
        let mut index = repo.index()?;

        // Stage everything (untracked + modified + deleted).
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        // git2 0.19's Index has no `has_changes`; detect a clean tree
        // by comparing the current HEAD tree with the freshly written
        // index tree (after write_tree — an unchanged tree yields the
        // same OID, so committing would be a no-op).
        let oid = index.write_tree()?;
        let tree = repo.find_tree(oid)?;
        let sig = self.signature()?;

        // Parent = current HEAD commit (may be absent on the initial commit,
        // but init() always makes one first).
        let parent_commit = repo.head()?.peel_to_commit()?;
        // NoChanges detection: if the freshly written tree matches the
        // parent's tree, nothing actually changed — bail out instead
        // of producing an empty commit.
        if parent_commit.tree_id() == oid {
            return Err(ResultManagerError::NoChanges(task_id.to_string()));
        }
        let new_oid = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent_commit])?;
        Ok(new_oid)
    }

    /// Walk the commit log newest-first.
    pub fn history(
        &self,
        task_id: &str,
        limit: usize,
    ) -> Result<Vec<CommitInfo>, ResultManagerError> {
        let path = self.repo_path(task_id)?;
        let repo = Repository::open(&path).map_err(|e| match e.code() {
            git2::ErrorCode::NotFound => ResultManagerError::NotFound(task_id.to_string()),
            _ => ResultManagerError::Git(e),
        })?;
        let mut revwalk = repo.revwalk()?;
        revwalk.push_head()?;
        let mut out = Vec::new();
        for oid in revwalk.take(limit) {
            let oid = oid?;
            let commit = repo.find_commit(oid)?;
            let short_id = oid.to_string()[..7].to_string();
            let author = commit.author();
            let timestamp = commit.time().seconds();
            let message = commit.message().unwrap_or("").trim().to_string();
            out.push(CommitInfo {
                id: oid.to_string(),
                short_id,
                author: format!(
                    "{} <{}>",
                    author.name().unwrap_or(""),
                    author.email().unwrap_or("")
                ),
                timestamp,
                message,
            });
        }
        Ok(out)
    }
}

fn match_dir() -> Result<PathBuf, ResultManagerError> {
    dirs::home_dir().ok_or_else(|| ResultManagerError::Io(std::io::Error::other("no $HOME")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_mgr() -> ResultManager {
        let dir = env::temp_dir().join(format!("shadow-rm-test-{}", uuid::Uuid::new_v4()));
        ResultManager::new(dir)
    }

    #[test]
    fn init_creates_repo_and_readme_and_initial_commit() {
        let m = temp_mgr();
        let path = m.init("task-001", "Demo task").unwrap();
        assert!(path.join(".git").is_dir(), ".git should exist after init");
        let readme = std::fs::read_to_string(path.join("README.md")).unwrap();
        assert!(readme.contains("task-001"));
        assert!(readme.contains("Demo task"));
        // HEAD points at the initial commit.
        let repo = Repository::open(&path).unwrap();
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head.message().unwrap().trim(), ("init: task task-001"));
    }

    /// ⚠️ **路径穿越回归**（2026-11-08 安全扫描发现）。
    ///
    /// 以前 `repo_path` 是裸 `base.join(task_id)` ⇒ `../` 能逃出 base，
    /// Windows 上绝对路径还会**整体替换** base ⇒ ⇒ `init` 会在**任意**
    /// 目录建 git 仓库 ＋ 写 README ＋ commit。
    #[test]
    fn init_rejects_task_ids_that_escape_the_base_dir() {
        let m = temp_mgr();
        // ⚠️ 逃逸目标用**唯一名** —— 断言查的是文件系统上的一个路径，
        // 用固定名会与并跑的其它测试撞车（temp_dir 是**共享**的）。
        let escape_name = format!("escape-{}", uuid::Uuid::new_v4());
        let evil_id = format!("../{escape_name}");
        for evil in [
            evil_id.as_str(),
            "..\\escape",
            "..",
            ".",
            "/abs/path",
            "C:\\Windows\\Temp\\evil",
            "",
        ] {
            let err = m.init(evil, "title").unwrap_err();
            assert!(
                matches!(err, ResultManagerError::InvalidTaskId(_)),
                "task id {evil:?} 必须被拒（拿到了 {err:?}）",
            );
        }
        // 拒绝 ⇒ 什么目录都没被创建（连 base 外那一层都没有）。
        let base = m.base_dir().to_path_buf();
        let outside = base.parent().unwrap().join(&escape_name);
        assert!(!outside.exists(), "不该在 base 外创建任何东西");
    }

    #[test]
    fn commit_and_history_reject_escaping_task_ids_too() {
        let m = temp_mgr();
        assert!(matches!(
            m.commit("../escape", "msg").unwrap_err(),
            ResultManagerError::InvalidTaskId(_)
        ));
        assert!(matches!(
            m.history("../escape", 10).unwrap_err(),
            ResultManagerError::InvalidTaskId(_)
        ));
    }

    #[test]
    fn init_is_idempotent() {
        let m = temp_mgr();
        let path1 = m.init("task-002", "first").unwrap();
        let path2 = m.init("task-002", "second").unwrap();
        assert_eq!(path1, path2);
        // The README must NOT have been overwritten by the second init.
        let readme = std::fs::read_to_string(path1.join("README.md")).unwrap();
        assert!(readme.contains("first"), "first init title should survive");
        assert!(!readme.contains("second"));
    }

    #[test]
    fn init_returns_existing_path_for_already_initialised_task() {
        let m = temp_mgr();
        m.init("task-003", "x").unwrap();
        let path = m.init("task-003", "x").unwrap();
        assert!(path.join(".git").is_dir());
    }

    #[test]
    fn commit_picks_up_changes() {
        let m = temp_mgr();
        m.init("task-004", "commit test").unwrap();
        let path = m.repo_path("task-004").unwrap();
        // Add a new file to the workdir.
        // ⚠️ 2026-11-08：**先建目录再写文件** —— 以前这里反着来
        // （write 在 create_dir_all 之前）⇒ ⇒ 目标目录不存在 ⇒ write 报
        // NotFound ⇒ ⇒ 这条测试**一直是红的**（而桌面 crate 的 Rust 测试
        // 不在 CI 里跑 ⇒ ⇒ 没人看见）。
        std::fs::create_dir_all(path.join("artifacts")).unwrap();
        std::fs::write(path.join("artifacts").join("plan.md"), "# plan").unwrap();
        // Add the directory + file via index.add_path before commit.
        let oid = m.commit("task-004", "add plan").unwrap();
        let _ = oid;
        // History should now have 2 commits (init + add plan).
        let history = m.history("task-004", 10).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].message, "add plan");
        assert_eq!(history[1].message, "init: task task-004");
    }

    #[test]
    fn commit_returns_no_changes_on_clean_tree() {
        let m = temp_mgr();
        m.init("task-005", "x").unwrap();
        // Just init → no further changes to commit.
        let err = m.commit("task-005", "noop").unwrap_err();
        assert!(matches!(err, ResultManagerError::NoChanges(_)));
    }

    #[test]
    fn history_is_newest_first_and_respects_limit() {
        let m = temp_mgr();
        m.init("task-006", "x").unwrap();
        let path = m.repo_path("task-006").unwrap();
        for i in 0..3 {
            std::fs::create_dir_all(path.join("stage")).unwrap();
            std::fs::write(path.join("stage").join(format!("{i}.md")), i.to_string()).unwrap();
            m.commit("task-006", &format!("stage {i}")).unwrap();
        }
        let history = m.history("task-006", 2).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].message, "stage 2");
        assert_eq!(history[1].message, "stage 1");
    }

    #[test]
    fn history_for_unknown_task_returns_not_found() {
        let m = temp_mgr();
        let err = m.history("never-initialised", 10).unwrap_err();
        assert!(matches!(err, ResultManagerError::NotFound(_)));
    }

    #[test]
    fn commit_for_unknown_task_returns_not_found() {
        let m = temp_mgr();
        let err = m.commit("never-initialised", "x").unwrap_err();
        assert!(matches!(err, ResultManagerError::NotFound(_)));
    }

    #[test]
    fn commit_info_serializes_to_json() {
        let m = temp_mgr();
        m.init("task-007", "serde").unwrap();
        let history = m.history("task-007", 10).unwrap();
        let json = serde_json::to_string(&history[0]).unwrap();
        assert!(json.contains("init: task task-007"));
        assert!(json.contains("shadow <shadow@iBLOC.local>"));
        assert!(json.contains("short_id"));
    }

    #[test]
    fn with_default_base_dir_uses_home_dot_shadow_results() {
        let m = ResultManager::with_default_base_dir().unwrap();
        let s = m.base_dir().to_string_lossy().replace('\\', "/");
        assert!(
            s.ends_with(".shadow/results"),
            "base_dir should end with .shadow/results, got {s}"
        );
    }
}
