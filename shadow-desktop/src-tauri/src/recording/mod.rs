//! 记录模式 — 录音/录像会话 + 事件存储。
//!
//! Implements the data-model half of
//! [`2026-09-24-recording-mode-design.md`](../../../../docs/superpowers/specs/2026-09-24-recording-mode-design.md)
//! (R1 phase): RecordingSession / RecordingEvent types, an in-memory
//! session registry, event accumulation, and hippocampus persistence
//! via the `HippocampusRecorder` trait (MockHippocampus for tests;
//! the real HTTP impl lands with R2's pipeline wiring).
//!
//! The audio (VAD→voiceprint→ASR) and video (frame→mage-vl→face)
//! pipelines plug in via `RecordingSink` — they *produce* events;
//! this module *stores* and *exports* them.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordingMode {
    Audio,
    Video,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingSession {
    pub id: String,
    pub mode: RecordingMode,
    pub started_at: String,
    #[serde(default)]
    pub ended_at: Option<String>,
    /// Wall-clock epoch ms at session start; events' rel_ms are
    /// relative to this.
    pub wallclock_start_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordingEventType {
    Audio,
    Video,
}

/// 单表同构事件 (design doc §3.2) — 音视频事件同构存储。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingEvent {
    pub id: String,
    pub session_id: String,
    pub event_type: RecordingEventType,
    /// 相对 session 起点的开始/结束时间 (ms)。
    pub start_rel_ms: i64,
    pub end_rel_ms: i64,
    /// 音频=ASR 文本；视频=mage-vl 描述。
    pub content: String,
    /// 关联的海马体 Person 实体 id 列表。
    #[serde(default)]
    pub person_ids: Vec<String>,
    #[serde(default)]
    pub confidence: f32,
    /// 原始媒体引用（可选，加密落盘或不出本地）。
    #[serde(default)]
    pub raw_media_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryReport {
    pub id: String,
    pub session_id: String,
    pub text: String,
    #[serde(default)]
    pub topics: Vec<String>,
    #[serde(default)]
    pub person_ids: Vec<String>,
    pub event_count: usize,
    pub time_range: (i64, i64),
}

/// 海马体持久化端口。真实实现 POST /api/memories（dimension =
/// recording_event / recording_summary）；测试用 MockHippocampus。
///
/// ⚠️ **端口还没接上生产实现**（2026-11-08）：只有测试在用 ⇒ ⇒ 但它是
/// 「录制 → 海马体」这条链的**边界定义**（接上真实现时不用改调用方）
/// ⇒ ⇒ 显式豁免并留名。
#[allow(dead_code)]
#[async_trait::async_trait]
pub trait HippocampusRecorder: Send + Sync {
    async fn put_event(&self, event: &RecordingEvent) -> Result<(), String>;
    async fn put_summary(&self, report: &SummaryReport) -> Result<(), String>;
}

/// 内存版 — 会话/事件的权威存储（进程内）。重启后从海马体恢复
/// 是 R2+ 的活；v1 会话生命周期 = 进程生命周期。
#[derive(Default)]
pub struct RecordingStore {
    sessions: Mutex<HashMap<String, RecordingSession>>,
    /// session_id → events (插入序)。
    events: Mutex<HashMap<String, Vec<RecordingEvent>>>,
    /// session_id → summary (会话结束后写入)。
    summaries: Mutex<HashMap<String, SummaryReport>>,
    event_seq: AtomicU64,
}

impl RecordingStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start_session(&self, mode: RecordingMode) -> RecordingSession {
        let id = format!("rec-{}", uuid::Uuid::new_v4());
        let session = RecordingSession {
            id: id.clone(),
            mode,
            started_at: chrono::Utc::now().to_rfc3339(),
            ended_at: None,
            wallclock_start_ms: chrono::Utc::now().timestamp_millis(),
        };
        self.sessions
            .lock()
            .unwrap()
            .insert(id.clone(), session.clone());
        self.events.lock().unwrap().insert(id, Vec::new());
        session
    }

    pub fn stop_session(&self, session_id: &str) -> Option<RecordingSession> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(session_id)?;
        session.ended_at = Some(chrono::Utc::now().to_rfc3339());
        Some(session.clone())
    }

    /// Generate a synthetic event for active sessions (dev/demo).
    /// Real audio pipeline (neuron VAD→ASR) replaces this in production.
    pub fn tick_synthetic_events(&self, session_id: &str) {
        let sessions = self.sessions.lock().unwrap();
        let session = match sessions.get(session_id) {
            Some(s) if s.ended_at.is_none() => s.clone(),
            _ => return,
        };
        drop(sessions);

        let elapsed = chrono::Utc::now().timestamp_millis() - session.wallclock_start_ms;

        // Snapshot the current state, then drop the lock before calling
        // add_event (which acquires its own lock).
        let (list_len, last_end) = {
            let events = self.events.lock().unwrap();
            let list = match events.get(session_id) {
                Some(l) => l.clone(),
                None => {
                    // First event — add a session start marker.
                    let _ = self.add_event(
                        session_id,
                        RecordingEventType::Audio,
                        elapsed,
                        elapsed + 200,
                        "Recording session started — listening…".into(),
                        vec![],
                        1.0,
                    );
                    return;
                }
            };
            (list.len(), list.last().map(|e| e.end_rel_ms).unwrap_or(0))
        };
        let gap = elapsed - last_end;
        if gap < 3000 {
            return; // Less than 3s since last event — don't spam.
        }

        // Generate a synthetic event with rotating content.
        let pool: [(&str, &str, f32); 5] = [
            ("audio", "检测到人声活动", 0.92),
            ("audio", "环境音：背景噪音正常", 0.71),
            ("audio", "语音段：说话内容待转写", 0.88),
            ("video", "画面：人在工位上", 0.90),
            ("audio", "检测到键盘敲击声", 0.85),
        ];
        let idx = list_len % pool.len();
        let (etype, content, conf) = pool[idx];
        let _ = self.add_event(
            session_id,
            if etype == "audio" {
                RecordingEventType::Audio
            } else {
                RecordingEventType::Video
            },
            elapsed,
            elapsed + 500,
            content.to_string(),
            vec![],
            conf,
        );
    }

    pub fn get_session(&self, session_id: &str) -> Option<RecordingSession> {
        self.sessions.lock().unwrap().get(session_id).cloned()
    }

    pub fn list_sessions(&self) -> Vec<RecordingSession> {
        let mut list: Vec<_> = self.sessions.lock().unwrap().values().cloned().collect();
        list.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        list
    }

    /// 追加事件。start/end_rel_ms 必须合法 (end >= start, start >= 0)。
    ///
    /// ⚠️ 参数多（8 个）—— 这是**事件载荷**的字段平铺（时间/内容/说话人/
    /// 置信度），调用点已定 ⇒ ⇒ 显式豁免（拆结构体要改所有调用方）。
    #[allow(clippy::too_many_arguments)]
    pub fn add_event(
        &self,
        session_id: &str,
        event_type: RecordingEventType,
        start_rel_ms: i64,
        end_rel_ms: i64,
        content: String,
        person_ids: Vec<String>,
        confidence: f32,
    ) -> Result<RecordingEvent, String> {
        if !self.sessions.lock().unwrap().contains_key(session_id) {
            return Err(format!("unknown session {session_id}"));
        }
        if start_rel_ms < 0 || end_rel_ms < start_rel_ms {
            return Err(format!("invalid time range [{start_rel_ms}, {end_rel_ms}]"));
        }
        let seq = self.event_seq.fetch_add(1, Ordering::Relaxed);
        let event = RecordingEvent {
            id: format!("evt-{}-{seq}", uuid::Uuid::new_v4()),
            session_id: session_id.to_string(),
            event_type,
            start_rel_ms,
            end_rel_ms,
            content,
            person_ids,
            confidence,
            raw_media_ref: None,
        };
        self.events
            .lock()
            .unwrap()
            .entry(session_id.to_string())
            .or_default()
            .push(event.clone());
        Ok(event)
    }

    pub fn events(&self, session_id: &str) -> Vec<RecordingEvent> {
        self.events
            .lock()
            .unwrap()
            .get(session_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn event_count(&self, session_id: &str) -> usize {
        self.events(session_id).len()
    }

    /// 生成并存储总结报告。`summarize` 是 agent 调用口（v1 用
    /// 拼接文本的 stub；R4 换 telencephalon LLM 调用）。
    pub fn summarize(
        &self,
        session_id: &str,
        summarize: impl FnOnce(&[RecordingEvent]) -> (String, Vec<String>),
    ) -> Result<SummaryReport, String> {
        let events = self.events(session_id);
        if events.is_empty() {
            return Err(format!("session {session_id} has no events"));
        }
        let (text, person_ids) = summarize(&events);
        let report = SummaryReport {
            id: format!("sum-{}", uuid::Uuid::new_v4()),
            session_id: session_id.to_string(),
            text,
            topics: Vec::new(),
            person_ids,
            event_count: events.len(),
            time_range: (
                events.first().map(|e| e.start_rel_ms).unwrap_or(0),
                events.last().map(|e| e.end_rel_ms).unwrap_or(0),
            ),
        };
        self.summaries
            .lock()
            .unwrap()
            .insert(session_id.to_string(), report.clone());
        Ok(report)
    }

    pub fn get_summary(&self, session_id: &str) -> Option<SummaryReport> {
        self.summaries.lock().unwrap().get(session_id).cloned()
    }
}

// -- tests --

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_and_stop_session() {
        let store = RecordingStore::new();
        let s = store.start_session(RecordingMode::Audio);
        assert!(s.ended_at.is_none());
        let stopped = store.stop_session(&s.id).unwrap();
        assert!(stopped.ended_at.is_some());
        assert!(store.stop_session(&s.id).is_some(), "stop is idempotent");
    }

    #[test]
    fn stop_unknown_session_is_none() {
        let store = RecordingStore::new();
        assert!(store.stop_session("ghost").is_none());
    }

    #[test]
    fn add_event_round_trip() {
        let store = RecordingStore::new();
        let s = store.start_session(RecordingMode::Video);
        let e = store
            .add_event(
                &s.id,
                RecordingEventType::Audio,
                1000,
                3500,
                "你好".into(),
                vec!["person-1".into()],
                0.9,
            )
            .unwrap();
        assert_eq!(e.event_type, RecordingEventType::Audio);
        assert_eq!(e.start_rel_ms, 1000);
        assert_eq!(store.event_count(&s.id), 1);
        assert_eq!(store.events(&s.id)[0].content, "你好");
    }

    #[test]
    fn add_event_rejects_unknown_session() {
        let store = RecordingStore::new();
        assert!(store
            .add_event(
                "ghost",
                RecordingEventType::Audio,
                0,
                1,
                "x".into(),
                vec![],
                1.0
            )
            .is_err());
    }

    #[test]
    fn add_event_rejects_invalid_time_range() {
        let store = RecordingStore::new();
        let s = store.start_session(RecordingMode::Audio);
        assert!(store
            .add_event(
                &s.id,
                RecordingEventType::Audio,
                -1,
                10,
                "x".into(),
                vec![],
                1.0
            )
            .is_err());
        assert!(store
            .add_event(
                &s.id,
                RecordingEventType::Audio,
                100,
                50,
                "x".into(),
                vec![],
                1.0
            )
            .is_err());
    }

    #[test]
    fn summarize_builds_report_with_time_range() {
        let store = RecordingStore::new();
        let s = store.start_session(RecordingMode::Audio);
        store
            .add_event(
                &s.id,
                RecordingEventType::Audio,
                0,
                100,
                "a".into(),
                vec!["p1".into()],
                1.0,
            )
            .unwrap();
        store
            .add_event(
                &s.id,
                RecordingEventType::Audio,
                200,
                300,
                "b".into(),
                vec!["p2".into()],
                1.0,
            )
            .unwrap();
        let report = store
            .summarize(&s.id, |events| {
                let text = events
                    .iter()
                    .map(|e| e.content.as_str())
                    .collect::<Vec<_>>()
                    .join("；");
                let mut ids = Vec::new();
                for e in events {
                    ids.extend(e.person_ids.iter().cloned());
                }
                ids.sort();
                ids.dedup();
                (format!("总结：{text}"), ids)
            })
            .unwrap();
        assert_eq!(report.event_count, 2);
        assert!(report.text.contains("a"));
        assert!(report.text.contains("b"));
        assert_eq!(report.person_ids, vec!["p1".to_string(), "p2".to_string()]);
        assert_eq!(report.time_range, (0, 300));
        // Second call fails or returns same — get_summary returns stored.
        assert!(store.get_summary(&s.id).is_some());
    }

    #[test]
    fn summarize_empty_session_errors() {
        let store = RecordingStore::new();
        let s = store.start_session(RecordingMode::Audio);
        assert!(store.summarize(&s.id, |_| ("x".into(), vec![])).is_err());
    }

    #[test]
    fn list_sessions_sorted_newest_first() {
        let store = RecordingStore::new();
        let a = store.start_session(RecordingMode::Audio);
        std::thread::sleep(std::time::Duration::from_millis(5));
        let b = store.start_session(RecordingMode::Video);
        let list = store.list_sessions();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, b.id, "newest first");
        assert_eq!(list[1].id, a.id);
    }
}
