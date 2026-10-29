// ============================================================
// Shadow 桌面端导航 —— 由 scripts/gen_nav.mjs 生成
// 请勿手改。改 agent-surface.json 后重新运行：
//     node scripts/gen_nav.mjs
//
// 对话为主：对话是唯一主干，能力收成一块，表达形态是对话的形态。
// ============================================================

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Box,
  Brain,
  Cloud,
  Database,
  Eye,
  FileCode,
  GitBranch,
  LayoutGrid,
  MessageSquare,
  MessageSquareQuote,
  Mic,
  MousePointer,
  Plug,
  Radar,
  ScrollText,
  Settings,
  Sparkles,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";

export interface NavItem {
  id: string;
  labelKey: string;
  route: string;
  icon: LucideIcon;
}

export interface NavSection {
  id: string;
  labelKey: string;
  collapsible: boolean;
  items: NavItem[];
}

export interface NavManifest {
  sections: NavSection[];
  footer: NavItem[];
  /** 对话形态 —— 由对话页的形态切换器进入，不是导航项 */
  conversationModes: NavItem[];
}

export const desktopNav: NavManifest = {
  sections: [
    {
      id: "converse",
      labelKey: "nav.section.converse",
      collapsible: false,
      items: [
        { id: "chat", labelKey: "surface.chat", route: "/conversation", icon: MessageSquare },
      ],
    },
    {
      id: "work",
      labelKey: "nav.section.work",
      collapsible: false,
      items: [
        { id: "tasks", labelKey: "surface.tasks", route: "/tasks", icon: LayoutGrid },
        { id: "group", labelKey: "surface.group", route: "/group", icon: Users },
      ],
    },
    {
      id: "capability",
      labelKey: "nav.section.capability",
      collapsible: true,
      items: [
        { id: "models", labelKey: "surface.models", route: "/models", icon: Box },
        { id: "providers", labelKey: "surface.providers", route: "/providers", icon: Plug },
        { id: "mcp", labelKey: "surface.mcp", route: "/mcp", icon: Wrench },
        { id: "skills", labelKey: "surface.skills", route: "/skills", icon: Sparkles },
        { id: "memory", labelKey: "surface.memory", route: "/memory", icon: Database },
        { id: "flows", labelKey: "surface.flows", route: "/flows", icon: Workflow },
        { id: "prompt-settings", labelKey: "surface.promptSettings", route: "/prompt-settings", icon: MessageSquareQuote },
        { id: "workflow-studio", labelKey: "surface.workflowStudio", route: "/workflow-studio", icon: GitBranch },
      ],
    },
    {
      id: "more",
      labelKey: "nav.section.more",
      collapsible: true,
      items: [
        { id: "computer-use", labelKey: "surface.computerUse", route: "/computer-use", icon: MousePointer },
        { id: "jdm-editor", labelKey: "surface.jdmEditor", route: "/jdm-editor", icon: FileCode },
        { id: "previews", labelKey: "surface.previews", route: "/previews", icon: Eye },
        { id: "trace", labelKey: "surface.trace", route: "/trace", icon: Activity },
        { id: "logs", labelKey: "surface.logs", route: "/logs", icon: ScrollText },
        { id: "discovery", labelKey: "surface.discovery", route: "/discovery", icon: Radar },
        { id: "resonance", labelKey: "surface.resonance", route: "/resonance", icon: Cloud },
        { id: "telencephalon", labelKey: "surface.telencephalon", route: "/cortex-status", icon: Brain },
      ],
    },
  ],
  footer: [
    { id: "settings", labelKey: "surface.settings", route: "/settings", icon: Settings },
  ],
  conversationModes: [
    { id: "chat", labelKey: "surface.chat", route: "/conversation", icon: MessageSquare },
    { id: "voice", labelKey: "surface.voice", route: "/voice", icon: Mic },
  ],
};
