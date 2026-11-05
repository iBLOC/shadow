/**
 * 系统通知 —— 桌面端后台运行的「出口」面（tauri-plugin-notification）。
 *
 * ## 为什么需要它
 *
 * 关窗即进托盘（进程照常跑）之后，**用户看不见窗口**：录制结束、
 * 连接断掉这类「发生了但没界面」的事，需要一个能穿透到桌面的出口 ——
 * 就是系统通知。
 *
 * ## ⚠️ 权限模型
 *
 * Windows/macOS 首次发通知要系统授权；没授权 ⇒ 静默返回 false
 * （**不打扰**是默认，通知是增强，不许把业务流程拖红）。
 * web 构建没有通知能力 ⇒ 同样静默 false。
 */

import { isTauri } from './platform';

/** 发一条系统通知。返回 true = 真发出去了（权限有、环境支持）。 */
export async function notify(title: string, body: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import('@tauri-apps/plugin-notification');
    let granted = await isPermissionGranted();
    if (!granted) {
      // requestPermission 回的是 PermissionState（'granted' | 'denied' | 'default'）。
      granted = (await requestPermission()) === 'granted';
    }
    if (!granted) return false;
    sendNotification({ title, body });
    return true;
  } catch {
    // 通知失败不许连累业务调用点 —— 它是「报个信」，不是「必须送达」。
    return false;
  }
}

/**
 * 只在**窗口藏在托盘**时才发通知（可见时用户正看着界面，再弹通知是打扰）。
 *
 * 可见性判不了（headless / 测试环境拿不到窗口）⇒ 按**可见**处理 ——
 * 宁可不发，不许误发。
 */
export async function notifyIfWindowHidden(
  title: string,
  body: string,
): Promise<boolean> {
  if (!isTauri()) return false;
  let visible = true;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    visible = await getCurrentWindow().isVisible();
  } catch {
    visible = true;
  }
  if (visible) return false;
  return notify(title, body);
}
