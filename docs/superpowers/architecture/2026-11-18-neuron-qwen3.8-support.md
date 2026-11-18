# neuron 对 Qwen3.8 系列的支持评估（2026-11-18）

> 用户诉求逐字：「neuron 评估qwen3.8 系列模型的支持」。口径：neuron 是**本地推理**腿（四条 LLM 腿：candle ／ mistralrs ／ llamacpp ／ litert），评估对象是 Qwen3.8 系列**开放权重**的三个成员（Max 2.4T-A95B ／ 27B ／ Flash-Next）在每条腿上的装载与运行能力。**纯评估型文档，零代码改动**。

---

## ① 一手事实：系列成员（官方 blog ＋ HF 模型页）

| 成员 | 形态 | 发布 | 关键事实 |
|---|---|---|---|
| **Qwen3.8-Max**（`Qwen/Qwen3.8-2.4T-A95B`） | MoE，总参 **2.4T**、激活 **95B**，1M 上下文 | 2026-08-12 开放权重 | 另有 **FP8** 构建 |
| **Qwen3.8-27B** | **稠密 27B**，视觉-语言（vision_config 内嵌），**256K** 上下文 | 2026-08-13 | HF Transformers 格式；社区 16GB VRAM 可跑（GGUF 混合量化） |
| **Qwen3.8-Flash-Next** | **多模态 MoE**，Qwen4 预览架构（GGUF arch＝`qwen4exp`） | 2026-08-26 起 | 社区 GGUF 已有；llama.cpp 支持极新 |
| qwen3.8-max-0902 等 | **API 快照**（阿里云百炼） | 2026-09-02 | 云腿的活，**不在 neuron 的范围**（neuron 只管本地） |

## ② 本评估最要紧的一格：Qwen3.8-27B 的 `config.json` **就是** Qwen3.5 架构

真配置逐字取证（`huggingface.co/Qwen/Qwen3.8-27B/raw/main/config.json`）：

- `model_type: "qwen3_5"`（**与 Qwen3.5 逐字同一个字符串**）
- `architectures: ["Qwen3_5ForConditionalGeneration"]`（与 Qwen3.5 同一个架构类）
- `text_config`（内嵌）：64 层 ＝ **48 linear_attention ＋ 16 full_attention**（`full_attention_interval: 4`），`max_position_embeddings: 262144`，`vocab_size: 248320`，`head_dim: 256`，GQA 24Q/4KV，`rope_parameters: {rope_theta: 1e7, mrope_section: [11,11,10], partial_rotary_factor: 0.25}`，`mtp_num_hidden_layers: 1`
- `vision_config`：depth 27、hidden 1152、patch 16（Qwen3.5 族视觉塔）

⇒ ⇒ neuron 在 2026-10-29 已经把 **Qwen3.5** 全家评估过一遍并落了闸（neuron `AGENTS.md`「Qwen 3.5 is NOT served by the candle backend」条，verified against `Qwen/Qwen3.5-*` configs）⇒ ⇒ **那一次的判定原样继承给 27B**，因为架构类、model_type、config 形状三样逐字相同。逐腿如下。

## ③ 27B 逐腿判定

### ❶ candle 腿 —— 显式拒绝，拒绝得**正确**（零改动）

- `src/llm/candle_arch.rs:74-82`：`load_qwen3` 对 `model_type` 以 `qwen3_5` 开头的配置**点名拒绝**（「not supported by the candle backend… Serve Qwen 3.5 with the mistralrs backend (NEURON_LLM_RUNTIME=mistralrs) or with llama.cpp via a GGUF (NEURON_LLM_RUNTIME=llamacpp)」）⇒ ⇒ 27B 的 model_type 逐字就是 `qwen3_5` ⇒ ⇒ **这条错误原样命中、原文正确**：拒绝消息里点名的两条出路恰好就是真出路。
- 为什么必须拒绝：GDN 混合栈（48 层线性注意力）上游 candle-transformers **没有对应模块**（`AGENTS.md` 2026-10-29 已核）。
- 顺带：Qwen3.8-27B 也是 **MoE 拒绝名单之外、稠密拒绝名单之内**的形状——不会静默走稠密 Qwen3 loader 产出乱码（那是 `detect_arch` 的负控设计）。

### ❷ mistralrs 腿 —— **config 形状逐字段兼容，零代码改动**（真权重验证欠着）

- mistral.rs v0.8.22（仓内 pinned rev）自带 `Qwen3_5Loader` ＋ `Qwen3_5MoeLoader`（checkout `90e2939` 的 `mistralrs-core/src/pipeline/loaders/mod.rs:35-36`），auto-pipeline 按 `Qwen3_5ForConditionalGeneration` 路由 ⇒ ⇒ 27B 原样命中。
- **config 解析逐字段对账**（`vision_models/qwen3_5/config.rs` 的 `TextConfig` ↔ 27B 真 config）：head_dim 256 ✓ / vocab_size 248320 ✓ / hidden_size 5120 ✓ / intermediate_size 17408 ✓ / num_hidden_layers 64 ✓ / num_attention_heads 24 ✓ / num_key_value_heads 4 ✓ / hidden_act silu ✓ / max_position_embeddings 262144 ✓ / rms_norm_eps 1e-6 ✓ / **`rope_parameters` 是 loader 的原生必填结构**（rope_theta 默认 1e7、mrope_section 必填、partial_rotary_factor 默认 0.25）✓ / full_attention_interval 默认 4 ✓ / linear_conv_kernel_dim 4 ✓ / linear_{key,value}_head_dim 128 ✓ / linear_num_{key,value}_heads 16/48 ✓ / tie_word_embeddings false ✓ ⇒ ⇒ **无一缺失**。
- ⚠️ 两条分界要分清：neuron 的 `src/llm/config_shape.rs:49-89` 那个 rope_parameters 适配器是**给 Qwen3-VL loader 的**（那个 loader 要扁平 rope_theta）；`Qwen3_5` loader **原生吃嵌套形状** ⇒ ⇒ 适配器对 27B **不需要触发**（它的形状触发条件在 27B 上也会触发——`text_config.rope_parameters` 在——触发后只是把同值再抄成扁平字段，无害但多余；真正决定成败的是 loader 本身，而 loader 原生兼容）。
- 层型推导自洽：loader 按 `(i+1) % full_attention_interval == 0` 推导 full/linear（64 层 ⇒ 每 4 层一个 full ＝ 16 full ＋ 48 linear）⇒ ⇒ 与 config 里 `layer_types` 逐字一致。
- checkpoint 是 bf16（≈ **54 GB** 下载）；neuron 默认 ISQ q4_0（`NEURON_MISTRALRS_ISQ`）⇒ ⇒ 常驻 ≈ 15 GB ＋ KV ⇒ ⇒ RTX 3090（24 GB）级别可跑；`max_position_embeddings: 262144` 只影响 paged KV 的上限，实际上下文由内存决定（bf16 KV ≈ 64 KiB/token × 16 个 full-attention 层 ⇒ 32K 上下文 ≈ 2 GB）。
- **视觉塔装载但不用**（text-only）⇒ ⇒ 与 Qwen3.5-4B 那条 catalog 条目同款（`src/capabilities/catalog.rs:316`）；图像输入这条腿**没有接线**。
- ⚠️ **真权重从未跑过**：仓里连 Qwen3.5-4B 都没有真权重探针（`examples/` 里只有 wevisone_vl／real_model（Qwen3-0.6B 族）等；Qwen3.5-4B 那条是「loader 存在 ⇒ 广告可服务」的推断，不是跑出来的读数）⇒ ⇒ 27B 的 mistralrs 可服务性是**推断级**，不是**实测级**。

### ❸ llamacpp 腿 —— arch 认得 ＋ MTP 处理在仓；但 **256K 被 `DEFAULT_N_CTX=2048` 钳死**（零改动可跑，旋钮要拧）

- pin 的事实：`llama-cpp-sys-2 0.1.159`（crates.io）**内嵌 llama.cpp 0.4.1**，其 arch 表认得 `qwen35` ／ `qwen35moe`（`src/llama-arch.cpp:41-42`）⇒ ⇒ unsloth `Qwen/Qwen3.8-27B-GGUF`（GGUF arch＝`qwen35`，架构未变）**装载面通过**。
- MTP 处理在仓：`src/models/qwen35.cpp:36-38` 有 mtp_only trunk / `load_mtp` / `TENSOR_SKIP` 三态 ⇒ ⇒ 27B 那层 MTP 权重有路可走。
- ⚠️ **上下文钳制**：`src/llm/llamacpp_runtime.rs:86` `DEFAULT_N_CTX: u32 = 2048` ⇒ ⇒ 默认只给 2048 token ⇒ ⇒ 256K 是**模型有、腿没给**——要 `NEURON_LLAMA_CPP_N_CTX` 显式拧大（内存预算自担：全 256K ≈ 16 GB KV）。
- chat template：GGUF 元数据自带（Qwen3.8 仍是 ChatML 族）；缺元数据时 runtime 的 ChatML fallback（`llamacpp_runtime.rs:93`）与之一致。
- ⚠️ 真权重同样从未跑过（同上）。

### ❹ litert 腿 —— 白名单制，不适用

`src/llm/litert_runtime.rs:20-33`：只有 `phi-4-mini` 与 `qwen2.5-1.5b` 两个 id（含测试断言「qwen3-0.6b 必须被拒」）⇒ ⇒ 27B 不可能走这条腿。

### ❺ catalog ＝ 广告面，不是门

`can_serve` 的全部调用方都在 `capabilities/catalog.rs` 自己（定义 ＋ 测试）⇒ ⇒ **没有生产门控** ⇒ ⇒ 服务入口由 `NEURON_LLM_RUNTIME` ＋ `NEURON_LLM_DEFAULT_MODEL` 决定 ⇒ ⇒ 「26B 上不上 catalog」只影响 `/v1/models` 广告与文档表，不影响能不能跑。⇒ ⇒ 落地刀里仍应补条目（广告说谎也是说谎）。

## ④ Flash-Next（`qwen4exp`）逐腿判定 —— 只有 llamacpp 腿认得，且是**实验级**

- llama.cpp 上游 2026-08 末由 unsloth（danielhanchen）以 PR #27742 加入 `qwen4exp`；**neuron pin 的这份 llama.cpp 0.4.1 已经带完整实现**：`src/models/qwen4exp.cpp` **1294 行**（hyper-connections 的 `HYPER_CONNECTION_COUNT/LOW_RANK`、attention indexer 的 `HEAD_COUNT/KEY_LENGTH/TOP_K` 三键都在，`llama-model.cpp` 多处特判）。
- 社区读数（两级警报）：❶ 实现极新、decode **不吃稀疏注意力**（agentic 长上下文掉速明显）；❷ 某些预编译构建在部分硬件（Strix Halo／gfx1151）产出**坏输出**，官方建议从 unsloth 的 fork 自建 ⇒ ⇒ **neuron pin 的这份是哪一版**没有对过 ⇒ ⇒ 真权重验证之前**只按实验级对待**。
- mistralrs v0.8.22：**没有** `qwen4exp` loader（checkout 里 vision_models 只有 qwen2vl／2.5vl／3vl／3_5／3_5_moe 族）⇒ ⇒ 加载必败。
- candle：MoE ＋ 新架构，双重没有。
- 判定：**实验级可试（llamacpp 腿），不得广告、不得进 catalog 的可服务清单**。

## ⑤ Qwen3.8-Max（2.4T-A95B）—— 本地不可行，**不做**

内存地板数学：2.4T 参数 ⇒ bf16 ≈ 4.8 TB ／ FP8 ≈ 2.4 TB ／ 4-bit ≈ **1.2 TB** ⇒ ⇒ 任何桌面／单机都进不了 ⇒ 且 FP8 权重格式不在 neuron 任何一条腿的装载面（ISQ 只出 q4_0/q8_0；llama.cpp 的 FP8 GGUF 也不是 neuron pin 的这份的路径）⇒ ⇒ **四条腿全不可行** ⇒ ⇒ 这格写「不做」不是「欠着」。95B 激活的 MoE 形状在 candle 腿还会先撞 MoE 拒绝名单（即便参数量允许）。

## ⑥ 结论矩阵

| 成员 | candle | mistralrs | llamacpp | litert | 结论 |
|---|---|---|---|---|---|
| **Qwen3.8-27B** | 显式拒绝（正确） | **形状逐字段兼容，零改动**；真权重未验 | arch ＋ MTP 认得；默认 n_ctx 2048 钳 256K；真权重未验 | 白名单外 | **可落地**（mistralrs 腿为主、llamacpp 腿为辅）——两格都是「推断级」，差一次真权重读数 |
| **Flash-Next** | 无 | 无 loader（必败） | qwen4exp 实现整份在 pin 里；实现极新 ＋ 社区报坏输出 | 无 | **实验级**，不广告 |
| **Max 2.4T-A95B** | MoE 拒 ＋ 2.4T | 内存地板 1.2 TB@4bit | 同左 | 无 | **不做**（本地不可行，非工程缺口） |
| qwen3.8-max-0902（API） | — | — | — | — | 云腿的活，不在 neuron 范围 |

一句话：**Qwen3.8 系列里唯一「本地能跑」的成员是 27B，而它恰好整族继承了 2026-10-29 那次 Qwen3.5 评估的判定——candle 拒绝消息原文命中、mistralrs loader 原生吃它的 config 形状、llama.cpp 的 qwen35 arch ＋ MTP 处理都在 pin 里 ⇒ ⇒ 「支持」这件事 neuron 已经免费拿到了一半，欠的是把它从推断级抬到实测级。**

## ⑦ 下一刀（最小落地刀，预估两仓）

1. **真权重探针**（neuron）：仿 `examples/wevisone_vl_smoke.rs` 写 `qwen3_8_27b_smoke.rs`——mistralrs 腿：装载（ISQ q4_0）⇒ 文本 chat ⇒ think 块透传断言 ⇒ 装载耗时 ＋ tok/s 读数；llamacpp 腿（可选）：GGUF ＋ `NEURON_LLAMA_CPP_N_CTX` 抬到 8192 ⇒ 同一轮提问对拍。
2. **登记面**（neuron）：`capabilities/catalog.rs` 加 `cap("mistralrs", "Qwen/Qwen3.8-27B", &[TextInput], &[TextOutput], …)`（照 Qwen3.5-4B 那条，注释写明「视觉塔装载但不用；27B 架构＝qwen3_5」）＋ `docs/reference/models.md`（en／zh）各一行。
3. **闸面**（父仓）：探针跑出读数后才允许 AGENTS.md 把 27B 从「推断级」改「实测级」——口径与真机那一格同款（没跑就不许说）。

## ⑧ 不做清单

- **Max 2.4T-A95B 本地化**——内存地板 1.2 TB@4bit，非工程缺口，不做。
- **Flash-Next 广告／catalog 登记**——上游实现极新且有坏输出报告，等 llama.cpp 稳定再说。
- **candle 腿给 qwen3_5 加模块**——GDN 栈上游没有对应件，自己移植是另一个量级的刀，mistralrs 腿已覆盖，不做。
- **图像输入接进 27B（mistralrs 腿）**——Qwen3.5-4B 都还没接（vision tower 装载但不用），27B 不单独跳级。
- **256K 上下文默认放开**——KV 内存预算是用户决定，保持旋钮显式。

## ⑨ 仍然欠着的

- **真权重那一格**：27B 在两条腿上都**从未跑过**——本评估的全部「可跑」结论都是**形状对账级**（config 逐字段 ＋ arch 表逐条 ＋ MTP 处理在仓），不是实测级；探针跑出读数才算数。
- **pin 的新鲜度**：llama-cpp-sys-2 0.1.159 内嵌 llama.cpp 0.4.1，qwen4exp／qwen35 的实现是否是**修过坏输出之后**的版本没有对过（上游坏输出报告 2026-08 末）⇒ ⇒ 升 pin 那一刀（动构建链）不混进落地刀。
- **Qwen3.5-4B 自己的真权重验证**也欠着（广告在 docs，探针不在仓）⇒ ⇒ 落地刀顺带补齐它（同一个探针改个 id 就能跑两遍）。
- **上下文档位**：mistralrs 腿的 paged KV 上限、27B q4_0 ＋ 32K 上下文的真实驻留——待实测。
- **Web 取证时效**：系列成员事实取自 2026-11-18 的官方 blog ／ HF 页面 ／ 社区讨论；若上游后续发布新成员（如更小的 Qwen3.8 密集版），按本档同款流程重评。

## ⑩ 取证来源

- [Qwen 官方 blog（qwen3.8）](https://qwen.ai/blog?id=qwen3.8)　- 系列 ＋ Flash 发布口径
- [Qwen/Qwen3.8-27B config.json](https://huggingface.co/Qwen/Qwen3.8-27B/blob/main/config.json)　- ② 的逐字取证
- [Qwen/Qwen3.8-2.4T-A95B](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B)　- Max 开放权重 ＋ FP8 构建
- [unsloth/Qwen3.8-27B-GGUF](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF)　- 27B GGUF（arch qwen35）
- [unsloth/Qwen3.8-Flash-Next-GGUF](https://huggingface.co/unsloth/Qwen3.8-Flash-Next-GGUF)　- qwen4exp GGUF ＋ 坏输出讨论（discussion #52）
- [llama.cpp PR #27742（qwen4exp）](https://x.com/analogalok/status/2092609013422948833)　- 上游支持合并
- [r/LocalLLM：qwen4exp isn't ready](https://www.reddit.com/r/LocalLLM/comments/1w1gvqu/qwen38flashnext_qwen4exp_llamacpp_isnt_ready_for)　- 稀疏注意力 decode 缺口
- [ggml-org/llama.cpp discussion #27950](https://github.com/ggml-org/llama.cpp/discussions/27950)　- Strix Halo 17→47 tok/s 工作栈
- [unsloth.ai：qwen3.8-next 文档](https://unsloth.ai/docs/models/qwen3.8-next)　- 自建 fork 建议
- [Hacker News 讨论](https://news.ycombinator.com/item?id=49448210)　- qwen4exp 报错形态
