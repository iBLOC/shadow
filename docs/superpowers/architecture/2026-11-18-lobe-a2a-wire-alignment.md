# 叶区 HTTP A2A 入口 ⇄ 端脑 JSON-RPC 信封（2026-11-18）

> 一句话：**把「端脑发的那种信封」与「叶区收的那种报文」对齐**，让一份
> 表格从聊天框**真的**走到顶叶 ⇒ ⇒ 而不是「注册成功、请求 404」。

## 0. 起因（承上一刀撞出来的**存量债**）

上一刀（父仓 U+37AE 条，表格导入 ⇒ agent 建本体）做完之后，它自己撞出一笔债：

> 「数据类任务都分发给顶叶」这一格**不是缺一条路由**：端脑按 skill 选得到
> 顶叶；但**端脑发的是 JSON-RPC 信封** ⇒ ⇒ 而 synapse 的叶区 A2A 入口读的
> 是 skill 与 message **平级** ⇒ ⇒ **两边的形状对不上**。

⇒ 这一刀就去还那笔债。

## 1. 取证：线上真实形状（2026-11-18 逐字）

| 那一格 | 端脑发的 | 叶区收的 | 结果 |
|---|---|---|---|
| 路径 | POST 到**注册地址**（顶叶注册的是 `http://<bind>/api/a2a`） | 只挂 `/a2a/tasks/send` | **404** |
| 体形状 | `{jsonrpc,id,method,params:{id,message}}` | `{skill, message}` 平级 | **4001 skill not in request** |
| 身份 | 打包进 `metadata.name`（`__telencephalon_meta_v1__{…}`） | ctx 顶层要 `user_id` | **invalid context: missing field `user_id`** |
| 附件 | File part **只带 `uri`**（`uri` 为空 ⇒ ⇒ 整个 part 被丢掉） | skill 认顶层 `dataBase64` | **附件从来没离开过端脑** |
| 回话 | 要 `{result:{task:{status:{message}}}}` | 回**裸 payload** | **missing `result`** |

⇒ ⇒ **五个错位，一个根**：叶区入口是 v0.1 扁平面，端脑发的是 v0.2 JSON-RPC 面。

⚠️ **同族的第二笔**：「颞叶发给前额叶」这一格**已经**是通的 —— 端脑的
**原生**颞叶（`src/lobes/mod.rs` 里的 `forward_to_prefrontal`）**真的**在
转发 ⇒ ⇒ 那一格不是债。独立颞叶仓那个 `routed_to` 只是**给端脑看的提示**，
不是叶区自己转发（端脑已经转过了 ⇒ ⇒ 叶区再转发就是重复调用）。

## 2. 落点（四仓）

### ❶ synapse（共享库）—— 叶区入口升级成「双形」

**改** `src/lobe/a2a_server.rs`：

- `parse_send_request`（纯函数）：**两种报文形状**解成同一份 `SendRequest`；
  - skill 的四个来源：顶层 `skill` ／ `message.metadata.skill` ／
    `params.message.metadata.skill` ／ `params.metadata.skill`；
  - **再加上**解包 `metadata.name` 里那份（端脑 v0.1→v0.2 的唯一通道）；
- **身份注入**：ctx 里没有 `user_id` ⇒ ⇒ 从 metadata 里取 ⇒ ⇒ 真的没有
  ⇒ ⇒ **报错 4002**（不许编一个 ⇒ 那会把所有人的记忆混进一个桶）；
- **按来者的形状回话**：JSON-RPC ⇒ `{jsonrpc,id,result:{task:{status:{message}}}}`；
  旧的扁平 ⇒ ⇒ **仍是裸 payload**（老调用方是这么读的）；
- **路径**：send 挂在 `/a2a/tasks/send` ＋ **`/api/a2a`**（叶区注册地址）＋
  **`/`**（卡片公布的基址）—— 三处同一个 handler；
- 顺手订正文件头那句假话（原头声称「Wraps `A2AServerBuilder`」⇒ ⇒ 实现里
  根本没有它）。

**改** `src/lobe/mod.rs`：导出 `parse_send_request` ＋ `SendRequest` ＋ `SendError`。

**新** `tests/lobe_a2a_wire.rs`：判据放在**集成测试**里（从 crate 外面打线），
因为这一格要证的**就是「线上真收到什么」**。

### ❷ 端脑 —— 两个错位

**改** `src/a2a/client.rs`（`send_task_via_http`）：

- File part **改成 v0.2 的嵌套面** `{"type":"File","file":{bytes,name,mime_type}}`
  ⇒ ⇒ **字节上线**（以前只在 `uri` 存在时才发 ⇒ ⇒ 手机上的文件整个被丢）；
- 形状与**前额叶的 A2A handler** 一致（它反序列化的就是 synapse 的
  `MessagePart::File { file }`）⇒ ⇒ **前额叶与叶区同一段字节**；
- metadata **带上结构化的那份**（`decode_metadata_from_name` 解包后并进去）
  ⇒ ⇒ 同一段 metadata、两种读法都对 ⇒ ⇒ 不用猜「skill 藏在哪个键里」。

**改** `src/lobes/mod.rs`（原生颞叶）：

- **数据类 ⇒ 顶叶**：这一轮带了**表格** ⇒ ⇒ 不是对话、是数据任务 ⇒ ⇒ 归
  顶叶的 `ingest_spreadsheet`；
- 判据是「**这一轮带了表格文件**」（看得见的事实）⇒ ⇒ **不是推理** ⇒ ⇒ 与
  「端脑不许推理」那条纪律不冲突；
- 放在**意图分类之前** ⇒ ⇒ **省掉一次 LLM 调用** ⇒ ⇒ 数据类也不依赖大脑
  给不给对意图；
- 找叶区**按 skill、不按名字** ⇒ ⇒ 谁注册了这个 skill 谁接；
- 发出去之前**改写 skill**（结构化那份与打包那份**两处都改**）⇒ ⇒ 否则叶区
  会去找一个不存在的 skill ⇒ ⇒ 报「unknown skill」⇒ ⇒ 看着像对面叶区坏了。

### ❸ 顶叶 —— 附件从 `parts` 里取

**改** `src/ingest/skill.rs`：

- `resolve_attachment`：**两条路**（顶层 `dataBase64` ／ 消息 `parts` 里的
  File part）⇒ ⇒ 归成一份之后，后面七步**只认这一种** ⇒ ⇒ 入口的差异不许
  漏到业务里；
- `attachment_from_parts`：**两种 File 形状都认**（v0.2 嵌套面 ／ 扁平面）
  ⇒ ⇒ 只认一种 ⇒ ⇒ 另一边的附件**悄悄消失**（失败长得像成功）；
- 顶层字段那一格**原样保留**（直连调用、测试、别的入口都还在用）。

### ❹ 父仓 —— 闸 ＋ 文档 ＋ 台账

- `scripts/check-ontology-network.mjs`：**第十二条判据 O12**（线上接线面）
  ＋ 两道新变异 ⇒ ⇒ 自检 16/16 ⇒ ⇒ **18/18**；
- 本文档；
- 父仓／端脑／synapse 三本台账各一条。

## 3. 第十二条判据 O12（形状）

钉的是**接线**（谁发什么、谁收什么、附件字节在不在、数据类归谁）：

- 叶区入口：`parse_send_request` ＋ `SendRequest` ＋ `/api/a2a` ＋ JSON-RPC
  回话形状（`jsonrpc` ／ `result` ／ `task` ／ `status`）＋ 身份注入（`user_id`
  ＋ `4002`）＋ 打包前缀；
- 端脑客户端：`"bytes": file.bytes` ＋ 嵌套 `"file": {` ＋ `decode_metadata_from_name`；
- 端脑数据类路由：`DATA_TASK_SKILL` ＋ `"ingest_spreadsheet"` ＋
  `dispatch_data_task` ＋ `AttachmentKind::Spreadsheet`；
- 顶叶取附件：`resolve_attachment` ＋ `attachment_from_parts` ＋ `"parts"`；
- **负控**：接线面的实现段里**不许**出现具体场景词 ⇒ ⇒ 接线是**通用**的。

⚠️ 负控**逐文件**切 `#[cfg(test)]` ⇒ ⇒ 端脑 `a2a/client.rs` 里的「客户」在
**测试段** ⇒ ⇒ 不误伤。

## 4. 读数（2026-11-18）

| 那一格 | 读数 |
|---|---|
| synapse 线形状测试 | **8/8**（含**真回环**那一条：JSON-RPC 信封 ⇒ skill 真跑 ⇒ 附件真到 ⇒ 身份真注入） |
| 父仓本体闸 | **12/12** |
| 父仓闸自检 | **18/18**（新增两道 O12 变异） |
| 端脑 lib 编译 | 零 error |
| 顶叶单测 | **100/100**（原 96 ⇒ **+4**：附件从 `parts` 取 ＋ 两种 File 形状 ＋ 顶层字段兼容 ＋ 无附件报错） |

## 5. 仍然欠着的

❶ **真机那一格**（真手机 ⇒ ⇒ 真表格 ⇒ ⇒ 真海马体三元组）**仍空** —— 本刀
   的证据是**回环**级与**单测**级 ⇒ ⇒ 不许说「真机已验证」。
❷ **客户端「界面新建本体」界面** —— 用户明确要的那一格，仍欠着。
❸ **独立颞叶仓**那条 `routed_to` 仍只是提示（**设计如此**，不是债）。
❹ **本体模型市场** —— 明确不做。
❺ 真二进制那一格（进程重启后三元组仍能读回）仍空。

## 6. 不做清单

- ❌ 不改端脑的**意图分类**契约（数据类在分类**之前**就分流了 ⇒ ⇒ 大脑
  不用学新档）。
- ❌ 不动**前额叶**的 A2A handler（它的形状本来就是 v0.2 ⇒ ⇒ 端脑改成
  嵌套面之后**它反而更对**了）。
- ❌ 不预置任何场景模板（场景差异仍在**数据**里）。
