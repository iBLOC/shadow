/**
 * 「现在连的不是这个 App 的大脑」—— 说真话的那一条横幅。
 *
 * ⚠️ 什么时候才说话：
 *
 * * `starting` —— 启动头一秒钟的正常状态 ⇒ 不说（否则每次启动都闪一下红）；
 * * `listening` —— 自己的大脑在线 ⇒ 不说；
 * * `conflict` / `failed` —— 端脑面**没起来** ⇒ 必须说，而且要带上
 *   **真实原因**（系统错误原文）—— 不许只说「出错了」。
 *
 * ⚠️ 为什么不拦着用户不许发消息：那是**另一个决定**（那个端口上可能是
 * 用户自己故意起的独立端脑）。这一条只负责**说真话** ⇒ 让人知道自己在
 * 跟谁说话。
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { getBrainFaceStatus, type BrainFaceStatus } from '../../lib/brainFace';

/** 轮询间隔 —— 端口一空出来，横幅就该消失。 */
const POLL_MS = 3000;

export function BrainFaceBanner() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BrainFaceStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await getBrainFaceStatus();
      if (!cancelled) setStatus(next);
    };
    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!status || status.state === 'starting' || status.state === 'listening') {
    return null;
  }

  const conflict = status.state === 'conflict';
  return (
    <div
      role="alert"
      data-testid="brain-face-banner"
      className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
    >
      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p>
          {conflict
            ? t('brainFace.conflict', { addr: status.addr })
            : t('brainFace.failed', { addr: status.addr })}
        </p>
        {status.error ? (
          <p className="mt-0.5 break-all opacity-80" data-testid="brain-face-error">
            {status.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
