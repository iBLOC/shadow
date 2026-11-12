//! **设备通知读取** —— Windows 通知使用权（`UserNotificationListener`）的那一半。
//!
//! 与移动端的 `DeviceNotificationListener`（Android NotificationListenerService）
//! 同一语义：读**还在通知中心里的通知**（标题 / 正文 / 时间），给「感知模式」当输入。
//! 只读 —— 不清除、不回复、不点任何东西。
//!
//! ⚠️ Windows 的通知访问授权在 **系统设置 → 系统 → 通知**（逐应用的通知开关）⇒
//! 没授权 ⇒ GetAccessAsync 给 Denied ⇒ 本命令**明确失败**并指路，
//! 绝不静悄悄回空列表（「失败长得像成功」禁令）。
//!
//! ## 跨平台形状（承 computer_use.rs 的教训：不许裸 allow(dead_code)）
//! 纯函数（文本提取 / 时间换算）全平台可编译可测；WinRT 调用面在
//! `#[cfg(windows)]` 门内；非 Windows ⇒ 命令明确报「此平台不支持」。
//! Windows-only 的类型挂 `#[cfg_attr(not(windows), allow(dead_code))]` ——
//! 只静音「本平台无调用方」的那个面，不吞 Linux 面的真问题。

use serde::Serialize;

/// 一条通知的**扁平形状** —— 字段名与移动端 `readNotifications` 一字不差
///（模型在两端看到的是同一种东西）。
#[derive(Debug, Serialize)]
#[cfg_attr(not(windows), allow(dead_code))]
pub struct NotificationEvent {
    pub id: String,
    pub app: String,
    pub package: String,
    pub title: String,
    pub text: String,
    pub posted_at_ms: i64,
    pub ongoing: bool,
}

/// WinRT DateTime（1601-01-01 起 100ns 计数）→ Unix 毫秒 —— **纯函数**。
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn unix_ms_from_winrt(ticks: i64) -> i64 {
    // 1601 与 1970 相差 11_644_473_600 秒；ticks 是 100ns 一格 ⇒ ticks/10_000 = 毫秒。
    ticks / 10_000 - 11_644_473_600_000
}

/// 从通知绑定模板的 XML 里把文本段抠出来 —— **纯函数**，全平台可测。
///
/// ⚠️ 刻意不用正则（多层拼接的代码路径上转义字符会被逐层吃掉 ——
/// 台账 U+350B 条的教训）⇒ 手写扫描，零反斜杠。
/// 模板形状：`<binding template="ToastGeneric"><text>标题</text><text>正文</text></binding>`。
///
/// ⚠️ 真机实测（Win11 26300）：通知平台把 `Template()` 收成**模板名**（如 "ToastGeneric"）⇒
/// XML 不再给 ⇒ 本函数退居**回退路径**（老 build 兜底）；主路径见 win::texts_from_binding。
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn extract_text_values(template: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = template;
    while let Some(open) = rest.find("<text") {
        let after_open = &rest[open..];
        let close_of_open = match after_open.find('>') {
            Some(p) => p,
            None => break,
        };
        let body = &after_open[close_of_open + 1..];
        let end = match body.find("</text") {
            Some(p) => p,
            None => break,
        };
        let raw = body[..end].trim();
        if !raw.is_empty() {
            out.push(xml_unescape(raw));
        }
        rest = &body[end..];
    }
    out
}

/// title/text 的**归并**规则 —— **纯函数**：第一个非空当标题，其余全拼进正文。
///
/// ⚠️ 自适应通知的 text 值顺序不保证 ⇒ 归并规则必须确定，不能「猜哪个是标题」。
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn build_title_and_text(values: &[String]) -> (String, String) {
    let mut title = String::new();
    let mut rest: Vec<&str> = Vec::new();
    for v in values {
        let t = v.trim();
        if t.is_empty() {
            continue;
        }
        if title.is_empty() {
            title = t.to_string();
        } else {
            rest.push(t);
        }
    }
    (title, rest.join("\n"))
}

/// XML 基本实体反转义（&amp; **最后**替换 —— 它是其余实体的转义符）。
#[cfg_attr(not(windows), allow(dead_code))]
fn xml_unescape(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = s.to_string();
    for (from, to) in [
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", "\""),
        ("&apos;", "'"),
    ] {
        out = out.replace(from, to);
    }
    out.replace("&amp;", "&")
}

#[cfg(windows)]
mod win {
    use super::{build_title_and_text, extract_text_values, unix_ms_from_winrt, NotificationEvent};
    use windows::UI::Notifications::NotificationBinding;
    use windows::UI::Notifications::NotificationKinds;
    use windows::UI::Notifications::Management::{
        UserNotificationListener, UserNotificationListenerAccessStatus,
    };

    /// 从一个 binding 里提文本 —— 真机修法（Win11 26300 实测）：
    /// `Template()` 只回**模板名**（如 "ToastGeneric"），XML 不给 ⇒ 旧路径（解析模板 XML）永远空；
    /// 文本在 `GetTextElements()` 解析好的元素里（`AdaptiveNotificationText.Text()`，
    /// windows-rs 0.61 里方法在**类**结构体上，直调即可，不必 cast 接口）。
    /// 元素拿不到 / 为空 ⇒ 回退旧 XML 路径（老 build 上 Template() 可能给全文）。
    fn texts_from_binding(binding: &NotificationBinding) -> Vec<String> {
        if let Ok(elements) = binding.GetTextElements() {
            if let Ok(count) = elements.Size() {
                let mut out = Vec::with_capacity(count as usize);
                for i in 0..count {
                    if let Ok(el) = elements.GetAt(i) {
                        if let Ok(t) = el.Text() {
                            let s = t.to_string();
                            if !s.trim().is_empty() {
                                out.push(s);
                            }
                        }
                    }
                }
                if !out.is_empty() {
                    return out;
                }
            }
        }
        match binding.Template() {
            Ok(template) => extract_text_values(&template.to_string()),
            Err(_) => Vec::new(),
        }
    }

    /// 读通知中心里**当前还在**的通知（按创建时间倒序，取前 limit 条）。
    ///
    /// ⚠️ `.get()` 是阻塞等待（WinRT 异步 ⇒ 一直占着会卡住调用线程）⇒
    /// 调用方必须放在 blocking 线程池（见 notification_read_events）。
    pub(crate) fn read_events(limit: usize, _include_ongoing: bool) -> Result<Vec<NotificationEvent>, String> {
        let listener = UserNotificationListener::Current()
            .map_err(|e| format!("无法连接通知监听器：{e}"))?;

        // ⚠️ GetAccessStatus 是同步属性查询（0.61 元数据）⇒ 不是异步操作 ⇒ 不用 .get()。
        let access = listener
            .GetAccessStatus()
            .map_err(|e| format!("无法查询通知访问授权：{e}"))?;
        if access != UserNotificationListenerAccessStatus::Allowed {
            return Err(
                "通知访问未授权 —— 请在 系统设置 → 系统 → 通知 里允许本应用读取通知"
                    .to_string(),
            );
        }

        let notifications = listener
            // ⚠️ 0.61 元数据里 NotificationKinds 只有 Unknown/Toast（没有 Any）⇒ 取 Toast。
            .GetNotificationsAsync(NotificationKinds::Toast)
            .map_err(|e| format!("无法读取通知列表：{e}"))?
            .get()
            .map_err(|e| format!("无法读取通知列表：{e}"))?;

        let size = notifications
            .Size()
            .map_err(|e| format!("无法读取通知数量：{e}"))? as usize;

        // GetNotificationsAsync 的顺序**不保证** ⇒ 先摊平再统一排序。
        // ⚠️ Windows 的通知中心没有「常驻」概念（那是 Android 的常驻条）
        // ⇒ ongoing 恒为 false；include_ongoing 在这一端是收下但不改变结果的参数。
        let mut rows: Vec<(i64, u32, String, String, String)> = Vec::with_capacity(size);
        for i in 0..size {
            let notif = notifications
                .GetAt(i as u32)
                .map_err(|e| format!("无法读取第 {i} 条通知：{e}"))?;
            let id = notif.Id().map_err(|e| format!("无法读取通知 id：{e}"))?;
            let created = notif
                .CreationTime()
                .map_err(|e| format!("无法读取通知时间：{e}"))?;
            // ⚠️ 来源应用：AppInfo.DisplayInfo（1809+）给得出**显示名** ⇒ 拿得到就填；
            // 拿不到（旧系统/失败）⇒ 如实留空，不编「未知应用」。包名 WinRT 不给 ⇒ 恒空。
            let app_name = notif
                .AppInfo()
                .ok()
                .and_then(|ai| ai.DisplayInfo().ok())
                .and_then(|di| di.DisplayName().ok())
                .map(|h| h.to_string())
                .unwrap_or_default();
            let notification = notif
                .Notification()
                .map_err(|e| format!("无法读取通知内容：{e}"))?;
            let visual = notification
                .Visual()
                .map_err(|e| format!("无法读取通知 visual：{e}"))?;
            let bindings = visual
                .Bindings()
                .map_err(|e| format!("无法读取通知 binding：{e}"))?;
            let bsize = bindings
                .Size()
                .map_err(|e| format!("无法读取通知 binding 数量：{e}"))? as usize;
            let mut values: Vec<String> = Vec::new();
            for b in 0..bsize {
                let binding = bindings
                    .GetAt(b as u32)
                    .map_err(|e| format!("无法读取第 {b} 个 binding：{e}"))?;
                values.extend(texts_from_binding(&binding));
            }
            let (title, text) = build_title_and_text(&values);
            rows.push((unix_ms_from_winrt(created.UniversalTime), id, title, text, app_name));
        }
        rows.sort_by(|a, b| b.0.cmp(&a.0));

        let mut out = Vec::new();
        for (posted_at_ms, id, title, text, app_name) in rows.into_iter().take(limit) {
            out.push(NotificationEvent {
                id: id.to_string(),
                // ⚠️ app = 来源应用**显示名**（AppInfo.DisplayInfo，拿得到就填；
                // 拿不到如实留空）；package WinRT 不暴露 ⇒ 恒空。
                // 标题/正文/时间是主数据（与移动端字段同名同义）。
                app: app_name,
                package: String::new(),
                title,
                text,
                posted_at_ms,
                ongoing: false,
            });
        }
        Ok(out)
    }
}

/// Tauri 命令：读设备通知中心的近期通知。
///
/// ⚠️ WinRT 异步的 `.get()` 是阻塞等待 ⇒ 丢进 `spawn_blocking`，不占异步运行时。
/// ⚠️ 非 Windows ⇒ **明确失败**（不是空列表）。
#[tauri::command]
pub async fn notification_read_events(
    limit: Option<u32>,
    include_ongoing: Option<bool>,
) -> Result<serde_json::Value, String> {
    let limit = match limit {
        Some(v) if v >= 1 => (v as usize).min(200),
        _ => 30,
    };
    let include_ongoing = include_ongoing.unwrap_or(false);

    #[cfg(windows)]
    {
        let events =
            tokio::task::spawn_blocking(move || win::read_events(limit, include_ongoing))
                .await
                .map_err(|e| format!("通知读取任务失败：{e}"))??;
        Ok(serde_json::json!({
            "notifications": events,
            "count": events.len(),
        }))
    }

    #[cfg(not(windows))]
    {
        let _ = (limit, include_ongoing);
        Err("此平台不支持读取系统通知（目前只有 Windows 实现了通知使用权读取）".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{build_title_and_text, extract_text_values, unix_ms_from_winrt};

    #[test]
    fn extract_pulls_text_segments_out_of_a_toast_template() {
        let t = r#"<binding template="ToastGeneric"><text>会议提醒</text><text>15:00 三楼会议室</text></binding>"#;
        let values = extract_text_values(t);
        assert_eq!(
            values,
            vec!["会议提醒".to_string(), "15:00 三楼会议室".to_string()]
        );
        let (title, text) = build_title_and_text(&values);
        assert_eq!(title, "会议提醒");
        assert_eq!(text, "15:00 三楼会议室");
    }

    #[test]
    fn empty_or_missing_text_segments_degrade_to_empty_strings() {
        let values = extract_text_values(r#"<binding template="ToastGeneric"></binding>"#);
        assert!(values.is_empty());
        let (title, text) = build_title_and_text(&[]);
        assert_eq!(title, "");
        assert_eq!(text, "");
    }

    #[test]
    fn xml_entities_are_unescaped_and_amp_is_last() {
        let values = extract_text_values("<text>a &lt; b &amp;&amp; c</text>");
        assert_eq!(values, vec!["a < b && c".to_string()]);
    }

    #[test]
    fn winrt_epoch_converts_to_unix_ms() {
        // 1970-01-01T00:00:00Z 的 WinRT ticks = 116444736000000000。
        assert_eq!(unix_ms_from_winrt(116_444_736_000_000_000), 0);
        // +1 秒（1 s = 10_000_000 ticks）。
        assert_eq!(unix_ms_from_winrt(116_444_736_010_000_000), 1_000);
    }
}
