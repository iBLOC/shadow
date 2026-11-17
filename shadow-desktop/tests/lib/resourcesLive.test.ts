/**
 * 资源管理 —— **真运行级读数**（真 hippocampus 服务 ＋ 真 HTTP ＋ 真 blob 目录）。
 *
 * ⚠️ **为什么要有这一份**：组件级判据（`documentsClient.test.ts`）用的是
 * **mock fetch** ⇒ ⇒ mock **不校验字节** ⇒ ⇒ 「上传把二进制变成了 Base64」
 * 这一类缺陷在 mock 面**永远抓不到**（每一步都绿，而真打过去存回去的是
 * Base64 文本）⇒ ⇒ 必须有一层**真发出去**的判据。
 *
 * ⚠️ **它默认是跳过的**（`SHADOW_LIVE_HIPPOCAMPUS` 不等于 `1` 就整份跳过）
 * ⇒ ⇒ CI 里没有海马体也不会红 ⇒ ⇒ 但它也**不假装绿**（跳过就是跳过）。
 *
 * ## 怎么跑（真 hippocampus ⇒ 真请求）
 *
 * ```powershell
 * # 1. 起一个真 hippocampus（独立形态，带一个本地 blob 后端）
 * $env:HIPPOCAMPUS_DATA_DIR  = 'C:/Projects/iBLOC/hippocampus/.local/live'
 * $env:BLOB_BACKEND         = 'fs'
 * $env:BLOB_FS_ROOT         = 'C:/Projects/iBLOC/hippocampus/.local/live-blobs'
 * $env:HIPPOCAMPUS_CONSOLIDATOR = 'off'
 * $env:HIPPOCAMPUS_PORT     = '18080'
 * C:/Projects/iBLOC/hippocampus/target/debug/hippocampus-server.exe
 *
 * # 2. 跑这一份
 * $env:SHADOW_LIVE_HIPPOCAMPUS = '1'
 * pnpm exec vitest run tests/lib/resourcesLive.test.ts
 * ```
 *
 * ## 为什么要一个小代理
 *
 * ⚠️ 桌面端客户端打的是 `{端脑}/hippocampus/api/...` —— 因为**端脑**把
 * 海马体嵌在 `/hippocampus` 下（`outer.nest("/hippocampus", h)`）⇒ ⇒
 * 而独立形态的海马体把路由挂在**根**上（`/api/...`）⇒ ⇒ 这里用一个
 * 十几行的代理把那一层「嵌套」补上 ⇒ ⇒ 客户端**一字不改**地打真服务。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import { documentsClient } from '../../src/lib/documentsClient';
import { useTelencephalonStore } from '../../src/stores/telencephalonStore';

const LIVE = process.env.SHADOW_LIVE_HIPPOCAMPUS === '1';
/**
 * ⚠️ **直连模式**（SHADOW_LIVE_HIPPOCAMPUS_DIRECT=1）—— 摘掉代理那一层。
 *
 * 那台端脑**自己**就把海马体挂在 /hippocampus 下（telencephalon/src/api/mod.rs：
 * `outer.nest("/hippocampus", h)`）⇒ ⇒ 代理**不需要**了 ⇒ ⇒ 客户端这一发
 * 真的过了端脑的 **nest ＋ 门 ＋ 租户校验** ⇒ ⇒ 这才是「**真端脑里跑**」那一档。
 *
 * ⚠️ 默认那一档是「真海马体 ＋ 十几行代理」⇒ ⇒ **端脑那一层压根没被检验过**
 * ⇒ ⇒ 「能上传能下载」**不代表**「在端脑上也能」⇒ ⇒ 失败会长得像成功。
 */
const DIRECT = process.env.SHADOW_LIVE_HIPPOCAMPUS_DIRECT === '1';
/** 真 hippocampus 服务（独立形态）。 */
const SERVER_URL =
  process.env.SHADOW_LIVE_HIPPOCAMPUS_SERVER ?? 'http://127.0.0.1:18080';
/** 代理端口 —— 端脑那一层「嵌套」由它补上。 */
const PROXY_PORT = Number(
  process.env.SHADOW_LIVE_HIPPOCAMPUS_PROXY_PORT ?? 18081,
);

const TEXT =
  '资源管理真读数：海马体文档面的关键词通道能搜到这句话。 unique-token-9f3a';

/** 一段**二进制**字节（含 0x00 与 0xFF）—— 专治「被悄悄转成 Base64」。 */
function binaryBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 7 + (i % 251)) % 256;
  return out;
}

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

let proxy: Server;

describe.skipIf(!LIVE)('资源管理 —— 真 hippocampus 服务', () => {
  beforeAll(async () => {
    const server = new URL(SERVER_URL);
    proxy = createServer((req, res) => {
      const incoming = new URL(req.url ?? '/', SERVER_URL);
      // ⚠️ 去掉 /hippocampus 前缀 —— 端脑就是用 nest("/hippocampus", …) 挂的。
      const path = incoming.pathname.replace(/^\/hippocampus/, '') || '/';
      const upstream = httpRequest(
        `${SERVER_URL}${path}${incoming.search}`,
        {
          method: req.method,
          headers: { ...req.headers, host: server.host },
        },
        (upRes) => {
          res.writeHead(upRes.statusCode ?? 502, upRes.headers);
          upRes.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end('proxy error');
      });
      // ⚠️ **原样转发 body** —— 二进制上传全靠这一行。
      req.pipe(upstream);
    });
    if (DIRECT) {
      // ⚠️ 直连真端脑 ⇒ ⇒ 代理那一层**不启动** ⇒ ⇒ 客户端打的是端脑自己的面。
      //
      // ⚠️ 端脑的**门**认两把钥匙：读门＝影子锁 ∪ admin token；写门＝**只**认
      // admin token ⇒ ⇒ 桌面端在浏览器里那把 admin token 从 localStorage 取
      // （adminToken.ts 的 web 版分支）⇒ ⇒ 这里塞进去（**不打印**）。
      const admin = process.env.SHADOW_LIVE_HIPPOCAMPUS_ADMIN_TOKEN ?? '';
      if (admin) {
        window.localStorage.setItem('shadow-admin-token', admin);
      }
      useTelencephalonStore.getState().setBaseUrl(SERVER_URL);
      return;
    }
    await new Promise<void>((resolve) =>
      proxy.listen(PROXY_PORT, '127.0.0.1', () => resolve()),
    );
    // 客户端打的是 {端脑}/hippocampus/... ⇒ ⇒ 端脑地址＝代理地址。
    useTelencephalonStore.getState().setBaseUrl(
      `http://127.0.0.1:${PROXY_PORT}`,
    );
  });

  afterAll(async () => {
    if (DIRECT) return;
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  });

  it('上传（文本）⇒ 真服务收下并建索引（正文抽出来了）', async () => {
    const bytes = new TextEncoder().encode(TEXT);
    const doc = await documentsClient.upload({
      name: 'live-notes.txt',
      bytes,
      mime: 'text/plain',
      kind: 'file',
      source: 'desktop',
    });

    expect(doc.id).toBeTruthy();
    expect(doc.name).toBe('live-notes.txt');
    expect(doc.size).toBe(bytes.length);
    expect(doc.extracted).toBe(true);
    expect(doc.truncated).toBe(false);
    // ⚠️ blob key 的人格前缀 —— 少了它，桶里的文件就是**人人可读**的。
    expect(doc.blobKey.startsWith(`${doc.tenantId}/`)).toBe(true);
  });

  it('上传（二进制）⇒ 字节原样落盘，**逐字节**取回一致（不是 Base64）', async () => {
    const bytes = binaryBytes(1024);
    const doc = await documentsClient.upload({
      name: 'live-blob.bin',
      bytes,
      mime: 'application/octet-stream',
      kind: 'artifact',
      source: 'desktop',
    });

    expect(doc.size).toBe(bytes.length);
    // ⚠️ 二进制没有正文 ⇒ ⇒ 索引**如实**说「没抽出正文」⇒ ⇒ 只能按名字搜。
    expect(doc.extracted).toBe(false);

    const back = await documentsClient.download(doc.id);
    expect(back.bytes.length).toBe(bytes.length);
    expect(sha256(back.bytes)).toBe(sha256(bytes));
    // ⚠️ 显式排除「悄悄转成文本」这一种失败。
    expect(Buffer.from(back.bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it('列表 ⇒ 真服务能列出来', async () => {
    const list = await documentsClient.list({ limit: 50 });
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((d) => d.name === 'live-blob.bin')).toBe(true);
  });

  it('搜索（关键词通道）⇒ 真服务能搜到正文里的那句话', async () => {
    const results = await documentsClient.search('unique-token-9f3a', 10);
    expect(results.keyword.length).toBeGreaterThan(0);
    expect(
      results.keyword.some((h) => h.document.name === 'live-notes.txt'),
    ).toBe(true);
  });

  it('改名 ⇒ 真服务上名字真的变了', async () => {
    const list = await documentsClient.list({ limit: 50 });
    const target = list.find((d) => d.name === 'live-notes.txt');
    expect(target).toBeTruthy();

    const updated = await documentsClient.update(target!.id, {
      name: 'live-renamed.txt',
    });
    expect(updated.name).toBe('live-renamed.txt');

    const after = await documentsClient.list({ limit: 50 });
    expect(after.some((d) => d.name === 'live-renamed.txt')).toBe(true);
    expect(after.some((d) => d.name === 'live-notes.txt')).toBe(false);
  });

  it('删除 ⇒ 回包三件事实：索引删了、字节也删了、**没有**残留理由', async () => {
    const list = await documentsClient.list({ limit: 50 });
    const target = list.find((d) => d.name === 'live-blob.bin');
    expect(target).toBeTruthy();

    const result = await documentsClient.remove(target!.id);
    expect(result.deleted).toBe(true);
    expect(result.bytesDeleted).toBe(true);
    expect(result.bytesError).toBeNull();
  });

  it('负控：删完之后再取 ⇒ 404（不许回一个空文件当成功）', async () => {
    const list = await documentsClient.list({ limit: 50 });
    const gone = list.find((d) => d.name === 'live-blob.bin');
    expect(gone).toBeUndefined();

    // 列表里没了 ⇒ ⇒ 再删一次 ⇒ ⇒ 服务端说「没有这一行」。
    const result = await documentsClient.remove('00000000-0000-4000-8000-000000000000');
    expect(result.deleted).toBe(false);
  });
});
