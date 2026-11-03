/**
 * 会话的两个状态：**归档**（软标记，可恢复）与**删除**（物理，连带海马体里那份）。
 *
 * ⚠️ 为什么单独一个文件：页面只该负责「画」和「说真话」⇒ ⇒ 动作本身
 * （先动端脑还是先动本地、失败时本地动不动）必须**一处实现**、可单测。
 *
 * ⚠️ 两边的会话**不是同一个东西**：
 * - 端脑那边：真会话（`sessionId` 指向它）—— 归档与删除都发生在那里；
 * - 桌面本地：一份收件箱（zustand persist ⇒ localStorage）—— 只是影子。
 * ⇒ ⇒ 所以**先动端脑、再动本地** ⇒ ⇒ 两边不会各说各话（界面说归档了、
 * 端脑没归档 = 失败长得像成功）。
 *
 * ⚠️ 没有 `sessionId` 的会话（还没发过消息的本地草稿、录音会话）⇒ ⇒
 * 端脑那边根本没有这份会话 ⇒ ⇒ 动作**只动本地**（不假装端脑那边也有）。
 */
import { telencephalonClient } from './telencephalonClient';
import { useConversationStore } from '../stores/conversationStore';

export interface LifecycleOutcome {
  /** 整体有没有成。 */
  ok: boolean;
  /** 端脑那侧失败时的**原话**（说真话，不吞）。 */
  error?: string;
  /** 本地那份有没有真的动。 */
  localChanged: boolean;
}

function conversationOf(id: string) {
  return useConversationStore.getState().conversations.find((c) => c.id === id);
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * 归档 / 取消归档。
 *
 * ⚠️ 端脑先动 ⇒ 端脑拒绝（写门 401 / 404）⇒ ⇒ **本地那份原样不动**
 * ⇒ ⇒ 界面不会说谎，用户也能重试。
 */
export async function setConversationArchived(
  id: string,
  archived: boolean,
): Promise<LifecycleOutcome> {
  const conv = conversationOf(id);
  if (!conv) return { ok: false, localChanged: false };

  if (conv.sessionId) {
    try {
      if (archived) {
        await telencephalonClient.archiveConversation(conv.sessionId);
      } else {
        await telencephalonClient.unarchiveConversation(conv.sessionId);
      }
    } catch (e) {
      return { ok: false, error: messageOf(e), localChanged: false };
    }
  }

  useConversationStore.getState().updateConversation(id, { archived });
  return { ok: true, localChanged: true };
}

/**
 * 物理删除 —— 端脑那份（连带海马体里的会话行与全部消息）先删。
 *
 * ⚠️ 端脑删不掉 ⇒ ⇒ **本地那份也留着** ⇒ ⇒ 用户能重试，也不会出现
 * 「本地没了、端脑里还在」这种**看不见的孤儿**。
 */
export async function deleteConversationEverywhere(
  id: string,
): Promise<LifecycleOutcome> {
  const conv = conversationOf(id);
  if (!conv) return { ok: false, localChanged: false };

  if (conv.sessionId) {
    try {
      await telencephalonClient.deleteConversation(conv.sessionId);
    } catch (e) {
      return { ok: false, error: messageOf(e), localChanged: false };
    }
  }

  useConversationStore.getState().removeConversation(id);
  return { ok: true, localChanged: true };
}
