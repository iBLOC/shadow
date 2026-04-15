use std::collections::HashMap;
use std::process::Command;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub task_id: String,
    pub path: String,
    pub branch_name: String,
    pub base_branch: String,
}

pub struct WorktreeManager {
    worktrees: Arc<Mutex<HashMap<String, WorktreeInfo>>>,
}

impl WorktreeManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn create(
        &self,
        task_id: &str,
        repo_path: &str,
        base_branch: Option<&str>,
    ) -> Result<WorktreeInfo, String> {
        let worktree_path = format!("{}/.shadow/worktrees/task-{}", repo_path, task_id);
        let branch_name = format!(
            "task-{}/{}",
            task_id,
            &uuid::Uuid::new_v4().to_string()[..8]
        );
        let baseline = base_branch.unwrap_or("main");

        let output = Command::new("git")
            .args(["worktree", "add", "-b", &branch_name, &worktree_path, baseline])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git worktree add: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "git worktree add failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let info = WorktreeInfo {
            task_id: task_id.to_string(),
            path: worktree_path,
            branch_name,
            base_branch: baseline.to_string(),
        };

        let mut worktrees = self.worktrees.lock().await;
        worktrees.insert(task_id.to_string(), info.clone());

        Ok(info)
    }

    pub async fn delete(&self, task_id: &str) -> Result<(), String> {
        let worktrees = self.worktrees.lock().await;
        let info = worktrees.get(task_id).ok_or("Worktree not found")?;

        let output = Command::new("git")
            .args(["worktree", "remove", &info.path])
            .output()
            .map_err(|e| format!("Failed to execute git worktree remove: {}", e))?;

        if !output.status.success() {
            std::fs::remove_dir_all(&info.path)
                .map_err(|e| format!("Failed to remove worktree dir: {}", e))?;
        }

        drop(worktrees);

        let mut worktrees = self.worktrees.lock().await;
        worktrees.remove(task_id);

        Ok(())
    }

    pub async fn get(&self, task_id: &str) -> Option<WorktreeInfo> {
        let worktrees = self.worktrees.lock().await;
        worktrees.get(task_id).cloned()
    }

    pub async fn list(&self) -> Vec<WorktreeInfo> {
        let worktrees = self.worktrees.lock().await;
        worktrees.values().cloned().collect()
    }
}

impl Default for WorktreeManager {
    fn default() -> Self {
        Self {
            worktrees: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
