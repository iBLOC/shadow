//! MCP 目录 — shadow-desktop 内建 MCP server 的静态目录 +
//! agent↔MCP 绑定的 tauri command 面。
//!
//! 让 agent 选择加入哪些 MCP server：shadow-desktop 内建了
//! 5 个 MCP server（feishu / diencephalon / computer_use /
//! preview / recording），每个包含若干工具。agent 通过
//! telencephalon McpStore 的 McpAgentBinding 绑定 server 后
//! 即可在运行时使用那些工具。
//!
//! ⚠️⚠️ **这份目录当前是「目录」，不是「能力」**（2026-11-09 取证）——
//! ❶ `builtin_servers()` 在全仓**只被它自己与本文件的测试引用**
//!    ⇒ ⇒ 桌面端**没有任何 tauri command** 把这份目录发出去
//!    ⇒ ⇒ 前端也拿不到它。
//! ❷ 五个条目**都没有对应的 MCP server 实现**（只有 `feishu_mcp`
//!    有一个 `mcp_server()` 构造器，而它自己也标注「还没被挂载」）
//!    ⇒ ⇒ **目录里写的工具名，agent 一个都调不到**。
//! ⇒ ⇒ 所以下面 computer_use 那条目录**必须**写清楚「未挂载」，
//! 否则目录显示 11 个工具、实际 0 个可调 ⇒ ⇒ 那是「失败长得像成功」。

use serde::{Deserialize, Serialize};

/// 一个内建 MCP server 的目录信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerInfo {
    pub name: String,
    pub description: String,
    /// 来源模块（用于前端分组展示）。
    pub source: String,
    pub tools: Vec<McpToolInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
}

/// shadow-desktop 内建的 5 个 MCP server 目录。
pub fn builtin_servers() -> Vec<McpServerInfo> {
    vec![
        McpServerInfo {
            name: "feishu".into(),
            description: "飞书 MCP — 表格创建/写入/分享/删除 + 开关".into(),
            source: "feishu_mcp".into(),
            tools: vec![
                tool("feishu_sheet_create", "创建飞书表格，返回 token + URL"),
                tool("feishu_sheet_write", "写入表格数据"),
                tool("feishu_sheet_share", "分享表格给指定用户"),
                tool("feishu_sheet_delete", "删除飞书表格"),
                tool("feishu_set_enabled", "开关飞书集成"),
            ],
        },
        McpServerInfo {
            name: "diencephalon".into(),
            description: "间脑 MCP — 传感数据查询 + 音视频事件 + 采集".into(),
            source: "diencephalon".into(),
            tools: vec![
                tool("query", "DataFusion SQL 查询传感环形缓冲区"),
                tool("sensor_stats", "传感器统计"),
                tool("sensor_tail", "最近 N 条样本"),
                tool("archive_clip", "存档视频片段到 L2"),
                tool("subscribe_audio", "订阅音频事件"),
                tool("unsubscribe_audio", "取消音频事件订阅"),
            ],
        },
        McpServerInfo {
            name: "computer_use".into(),
            description: "Computer-use — 截图 + 鼠标 + 键盘 + Windows UIA 元素操作（⚠️ 目录条目：MCP server 尚未挂载，agent 调不到；下面的工具目前只是桌面端内部的 Tauri command）".into(),
            source: "computer_use".into(),
            tools: vec![
                tool("cu_screenshot", "截取主显示器（只读：失败一律 not_delivered / retry safe）"),
                tool("cu_mouse_click", "坐标点击（动作类：成功回执带 disposition.delivered_unverified ⇒ 不许盲目重试）"),
                tool("cu_mouse_move", "鼠标移动（动作类：同 cu_mouse_click）"),
                tool("cu_mouse_scroll", "滚轮滚动（动作类：同 cu_mouse_click）"),
                tool("cu_keyboard_type", "键入文本（动作类：同 cu_mouse_click）"),
                tool("cu_keyboard_combo", "按键组合（动作类：同 cu_mouse_click；wire 形状是规格串如 ctrl+c）"),
                tool("cu_set_enabled", "开关安全闸门"),
                tool("cu_list_ui_elements", "列出 UI 元素（Windows UIA；只读）"),
                tool("cu_click_ui_by_name", "按名称点击 UI 元素（动作类：同 cu_mouse_click）"),
                tool("cu_read_ui_text", "读取 UI 元素文本（只读）"),
                tool("cu_set_ui_value", "设置 UI 元素值（动作类：同 cu_mouse_click）"),
            ],
        },
        McpServerInfo {
            name: "preview".into(),
            description: "Browser-use — 独立 WebviewWindow 预览窗口".into(),
            source: "preview_window".into(),
            tools: vec![
                tool("preview_open", "打开预览窗口"),
                tool("preview_close", "关闭预览窗口"),
                tool("preview_list", "列出已打开的预览"),
            ],
        },
        McpServerInfo {
            name: "recording".into(),
            description: "记录模式 — 录音/录像会话管理 + 事件 + 总结".into(),
            source: "recording".into(),
            tools: vec![
                tool("recording_start", "开始录制（audio|video）"),
                tool("recording_stop", "停止录制"),
                tool("recording_status", "查询录制状态"),
                tool("recording_events", "拉取录制事件"),
                tool("recording_list", "列出录制会话"),
                tool("recording_report", "生成/获取总结报告"),
            ],
        },
    ]
}

fn tool(name: &str, description: &str) -> McpToolInfo {
    McpToolInfo {
        name: name.into(),
        description: description.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn five_servers_with_tools() {
        let servers = builtin_servers();
        assert_eq!(servers.len(), 5);
        let names: Vec<&str> = servers.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["feishu", "diencephalon", "computer_use", "preview", "recording"]
        );
        // 每个至少 3 个工具，每个工具有名称和描述。
        for s in &servers {
            assert!(s.tools.len() >= 3, "{} should have ≥3 tools", s.name);
            for t in &s.tools {
                assert!(!t.name.is_empty());
                assert!(!t.description.is_empty());
            }
        }
    }

    #[test]
    fn total_tool_count_is_28() {
        let total: usize = builtin_servers().iter().map(|s| s.tools.len()).sum();
        assert_eq!(total, 28, "5+6+11+3+6 = 28");
    }
}