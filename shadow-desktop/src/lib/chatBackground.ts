/**
 * 聊天背景图 —— 选一张图片，压成能安全住进 localStorage 的 data URL。
 *
 * 为什么存 data URL 而不是文件路径：
 *  - 桌面端是 Tauri webview，没接 dialog/fs 插件（为这一个功能引一串
 *    原生依赖与版本对齐不值）；`<input type="file">` 在 webview 与
 *    浏览器构建里都能用，`vite.config.web.ts` 的纯 web 构建也吃这一套；
 *  - 背景图要跨重启生效，文件路径会因换机器 / 移动文件而失效；
 *  - 长边压到 1920、编成 webp（不支持则退 jpeg）后通常只有几百 KiB，
 *    localStorage（约 5 MiB）装得下。
 */

/** 落进 store 的 data URL 长度上限（字符数 ≈ 二进制体积 × 4/3）。 */
export const MAX_BACKGROUND_DATAURL_CHARS = 1_500_000;

const DATA_URL_RE = /^data:image\/(?:png|jpeg|webp|gif);base64,/;

/** store 与渲染两头的共同判据：像背景图 data URL，且没超限。 */
export function isChatBackgroundDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    DATA_URL_RE.test(value) &&
    value.length <= MAX_BACKGROUND_DATAURL_CHARS
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`读不了这个文件：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('这张图片解不开（文件可能不是有效图片）'));
    img.src = src;
  });
}

const SCALES = [1, 0.75, 0.5];
const QUALITIES = [0.85, 0.7, 0.55];

/**
 * 图片 → 压缩后的背景 data URL。
 *
 * 长边压到 1920，格式 webp（不支持就退 jpeg）；从「原尺寸 × 高质量」
 * 往下试，直到体积落进 [MAX_BACKGROUND_DATAURL_CHARS]。全部档位试完
 * 还超限就报错 —— 宁可让用户换一张图，也不悄悄塞一张把 localStorage
 * 撑爆的图进去。
 */
export async function fileToBackgroundDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`不是图片文件：${file.type || file.name}`);
  }

  // 先确认画布可用（jsdom / 旧 webview 里 getContext 可能拿不到）——
  // 失败要说得出原因，而不是挂死在图片加载那一步。
  const probe = document.createElement('canvas');
  if (
    typeof probe.getContext !== 'function' ||
    probe.getContext('2d') === null
  ) {
    throw new Error('当前环境不支持画布（canvas），处理不了背景图');
  }

  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const webpSupported = probe
    .toDataURL('image/webp')
    .startsWith('data:image/webp');
  const mime = webpSupported ? 'image/webp' : 'image/jpeg';

  for (const scale of SCALES) {
    for (const quality of QUALITIES) {
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) continue;
      ctx.drawImage(img, 0, 0, width, height);
      const out = canvas.toDataURL(mime, quality);
      if (out.length <= MAX_BACKGROUND_DATAURL_CHARS) return out;
    }
  }
  throw new Error('这张图片压到最小档还是太大 —— 换一张小一点的');
}
