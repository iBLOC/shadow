# 表格导入 ⇒ agent 建本体 ⇒ 写数据（2026-11-17）

> **用户诉求逐字**：「我觉得导入excel这个问题还是得由agent来创建本体网络 聊天框支持发送excel相关格式 颞叶发给前额叶 数据类任务都分发给顶叶 顶叶处理的时候只取表头和前几行构建本体再执行数据写入」

## 1. 这一刀把什么换了

上一刀（模板包）走的是**「用户自己写 JSON 模板」**那条路。本刀换成
**「agent 从表格自己推断」**：

|  | 上一刀 | 本刀 |
|---|---|---|
| 本体形状从哪来 | **用户手写** JSON 模板包 | **agent 推断**（LLM 读表头 ＋ 前几行） |
| 表格从哪来 | 请求里带来的表 | **Excel 文件**（xlsx ／ xls ／ csv） |
| 谁来建本体 | 用户 | **前额叶的 agent** |
| 谁来写数据 | 调用方 | **顶叶**（解析 → 采样 → 推断 → 试运行 → 写入） |

⇒ ⇒ 两者**不冲突**：推断出来的那份**模板包**，正好就是上一刀入库的那个
`TemplatePackage` ⇒ ⇒ 用户推断完之后**仍可以在界面里改**（客户端「界面新建
本体」那一格仍欠着，见 `6）。

## 2. 链路形状

```
客户端（聊天框）
  │  附件：xlsx ⇒ **原样 base64**（不当文本解）
  ▼
端脑（附件分档）
  │  spreadsheet 这一档 ⇒ **不内联进 prompt**（它是二进制 ⇒ 内联＝乱码）
  ▼
A2A 消息（MessagePart::File：mime ＋ 字节 ＋ 文件名）
  ▼
顶叶 parietal：ingest_spreadsheet（**这一刀的主战场**）
  │  ❶ 解析（calamine 真解 xlsx ⇒ 每个 sheet 一张表）
  │  ❷ 采样（**只取表头 ＋ 前几行** ⇒ 这一份**只**用来建本体）
  │  ❸ 推断 ⇒ 回调前额叶 POST /api/ontology/infer ⇒ **模板包**
  │  ❹ 入库（海马体：模板包 ＋ 版本不可变 ⇒ 同 id 不同内容 ⇒ 升版本）
  │  ❺ 试运行（**不落库** ⇒ 报「会写多少／会跳过多少／哪些关系接不上」）
  │  ❻ 写入（**全量**数据 ⇒ 落进本体图）
  ▼
海马体 hippocampus（模板路由 ＋ 摄取路由 ⇒ 人格在路径里）
```

## 3. 四条语义纪律

1. **采样与写入是两份数据** —— 建本体只看**表头 ＋ 前几行**（省 token，
   也逼 agent 只根据表面证据下结论）；写入用**全量**。
2. **推断失败 ⇒ 直接报错** —— 绝不回退到「按列名猜一个模板」⇒ ⇒ 猜出来
   的本体会**长得像成功**。
3. **先试运行、再写入** —— 数字先出来，用户看得见「会写多少」。
4. **表按名字配对** —— agent 说的表名必须与 sheet 名一致 ⇒ ⇒ 对不上就
   报错，**不按位置猜**（位置猜错了，数据会写进**别的类**）。

## 4. 通用性依然可判

这一刀的实现段里**不许**出现具体场景词（父仓闸 O11 的负控）⇒ ⇒ 场景差异
仍然只能落在**数据**里（推断出来的那份 JSON）⇒ ⇒ 「换场景只换数据，不换
代码」这句话**继续可判**。

⚠️ 词表必须随场景扩 —— 每加一族场景，先加词表（承上一刀的自曝）。

## 5. 落点

| 仓 | 文件 | 落了什么 |
|---|---|---|
| 顶叶 parietal | **新** `src/ingest/{mod,parse,sample,infer,skill}.rs` | 真解析（calamine 0.38）＋ 采样 ＋ 推断客户端 ＋ `ingest_spreadsheet` skill ＋ 按名字配对 ＋ 先试运行后写入 |
| 顶叶 parietal | **改** `src/client.rs` | 海马体本体面四方法（save／list／dry-run／ingest）＋ 可选钥匙 |
| 顶叶 parietal | **改** `src/main.rs` ＋ `src/lib.rs` ＋ `Cargo.toml` | 注册 skill ＋ 三个新依赖（calamine ／ csv ／ base64） |
| 前额叶 prefrontal | **新** `src/server/ontology_infer.rs` | `POST /api/ontology/infer`：样本 ⇒ LLM ⇒ 模板包（含提示词 ＋ 代码块剥离 ＋ 校验） |
| 前额叶 prefrontal | **改** `src/server/{mod,routes}.rs` | 挂上那条路由 |
| 端脑 telencephalon | **改** `src/lobes/mod.rs` | `AttachmentKind::Spreadsheet`：认得 xlsx／xlsm ＋ **不内联进 prompt** |
| 移动端 shadow-mobile | **改** `lib/multimodal/attachment_encoder.dart` | `AttachmentKind.spreadsheet`：xlsx／xlsm **可发** ＋ MIME 反查大小写无关 |
| 父仓 shadow | **改** `scripts/check-ontology-network.mjs` | 第十一条判据 O11（表格导入面 ＋ 顺序 ＋ 采样 ＋ 负控）＋ 跨仓判据源 |
| 父仓 shadow | **新** 本文件 ＋ `AGENTS.md` | 文档 ＋ 账本条目 |

## 6. 读数

- 顶叶 `cargo test -p parietal --lib`：**96 过 ／ 0 红**（原 86 ⇒ **+10**）
- 前额叶 `cargo check -p prefrontal-core --lib`：**0 error**
- 移动端 `flutter test test/unit/attachment_wire_test.dart`：**20/20**（含新增 3 条）
- 父仓本体闸：**11/11**；自检：**16/16**（新增 3 道 O11 变异）
- 父仓状态面闸、圈码闸：**零违规**

## 7. 仍然欠着的

1. **「颞叶发给前额叶」的**真实**转发** —— 颞叶今天只算出 `routed_to` 这个
   URL，**并没有真的调用前额叶**；端脑那一侧对若干意图有
   `forward_to_prefrontal`，但**附件**那一格没有对应的一支。
2. **「数据类任务都分发给顶叶」的路由** —— 顶叶的 skill 叫
   `ingest_spreadsheet`，端脑按 skill 选叶区 ⇒ ⇒ **能选中**；但端脑发的是
   **JSON-RPC 信封**（jsonrpc ／ method 为 tasks/send ／ params 里才是 message），
   而 synapse 的叶区 A2A 入口读的是 skill 与 message 平级 ⇒ ⇒ **两边的形状
   对不上**（这是**存量债**，不是本刀引入的）⇒ ⇒ 要真通，得先把「叶区 HTTP
   A2A 入口」与「端脑发的信封」对齐。
3. **客户端「界面新建本体」界面** —— 用户明确要的那一格，仍欠着。
4. **真机那一格**、**真二进制那一格** —— 仍空。
5. **本体模型市场** —— 明确不做。
