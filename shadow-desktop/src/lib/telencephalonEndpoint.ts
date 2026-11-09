/**
 * 端脑地址（base URL）的**规范化与校验** —— 单独成模块，好让判据能单独钉它。
 *
 * ## 为什么必须先校验（2026-11-09 实测）
 *
 * ⚠️ 端脑地址是**用户可配**的那一个 ⇒ ⇒ 用户可能敲进空串、带空格、少了协议、
 * 敲错端口 ⇒ ⇒ 而地址一旦写进 store（**并且持久化**）⇒ ⇒ 它就是**所有页面**
 * 的真相源 ⇒ ⇒ 写坏了 ⇒ ⇒ 全量请求打到一个不存在的地址 ⇒ ⇒ 界面只说
 * 「连不上」⇒ ⇒ 而**用户改不回来**（那时还没有任何 UI 能改它）
 * ⇒ ⇒ **写不进 ≠ 写进了**。
 *
 * ⇒ ⇒ 所以规矩是：**先校验、后落盘**；不合格的地址**不许**进 store。
 *
 * ⚠️ **不许在这里发请求** —— 校验是纯函数（判据要能脱离网络跑）。
 */
export type EndpointRejectReason =
  | 'EMPTY'
  | 'NOT_A_URL'
  | 'BAD_PROTOCOL'
  | 'NO_HOST';

export type EndpointCheck =
  | { ok: true; value: string }
  | { ok: false; reason: EndpointRejectReason };

/**
 * 把用户敲的地址**规范化**成一个可以直接当 base URL 用的值。
 *
 * 规范化规则（**每条都有判据**）：
 * ❶ 两端空白**去掉**（用户复制来的地址常常带尾随空格）。
 * ❷ 结尾的斜杠**去掉**（带斜杠会让「地址 + /api/...」拼出双斜杠）。
 * ❸ **路径前缀保留**（有人把端脑挂在 /brain 下面 ⇒ 那是地址的一部分，
 *    抹掉它 ⇒ ⇒ 请求打到错误的根路径）。
 * ❹ **协议只收 http / https** —— 别的协议（file:、ftp:、javascript:）
 *    不是端脑 ⇒ ⇒ 早说「不合格」，别等到请求失败才说。
 */
export function normalizeTelencephalonBaseUrl(raw: string): EndpointCheck {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'EMPTY' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // ⚠️ **没有协议的地址（127.0.0.1:60080）在这里被拒** ——
    // new URL 对它抛错 ⇒ ⇒ 不会悄悄被当成别的东西。
    return { ok: false, reason: 'NOT_A_URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'BAD_PROTOCOL' };
  }
  if (!url.hostname) return { ok: false, reason: 'NO_HOST' };

  const path = url.pathname.replace(/\/+$/, '');
  const port = url.port ? ':' + url.port : '';
  return { ok: true, value: url.protocol + '//' + url.hostname + port + path };
}

/** 拒绝理由 ⇒ 人话（界面用；**中文是兜底**，i18n 键补齐后走 i18n）。 */
export const ENDPOINT_REJECT_TEXT: Record<EndpointRejectReason, string> = {
  EMPTY: '地址不能为空',
  NOT_A_URL: '这不是一个合法的 URL（要带 http:// 或 https://）',
  BAD_PROTOCOL: '只支持 http:// 或 https://',
  NO_HOST: '这个地址里没有主机名',
};
