# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-21
**Updated:** 2026-10-30 (⑲ **真机复验：链路断点定位到「叶区 → LLM」那一跳 + 根因修在上游端脑仓** —— 用户把手机接上后，把上一条挂着的「真机未验」真跑了一遍。① **设备**：小米 MIX 4（`2106118C` / Android 13 / arm64-v8a / Odin+SD835，USB adb `ee6b4832`）。**先撞上一个更早的坑：设备上那个 APK 是 10-29 08:34 装的，而修复它的提交是 12:28** ⇒ 移动端「设置页正文全白」**不是渲染 bug，是旧包的代码**（详见 `shadow-mobile/AGENTS.md` ⑲ 条：Flutter 3.47.8 的 `ListTile` debug 断言 + `GlassCard` 没套 `Material(type: transparency)`，body 子树构建中断）。**重编 `libencephalon.so` + 重打 APK 装上后，设置页完全正常**，这个挂了两天的「未结案」结案。② **链路三段都活了，断点精确在最后一跳**：重编 `.so`（`encephalon/scripts/build-android.ps1`，33 min，150.5 MB，含已合并的 `point_lobes_at_neuron`）与含 `e0ae904` 链路改造 Dart 代码的 APK ⇒ 真机上**端脑面起来了**（`files/flows` 的 mtime 正好是点「启动大脑」那一刻；`ss -tln` 捞到随机端口，`/.well-known/agent.json` 与 `/shadow/v1/agents` 都 200，四个 native 叶区都在）、**neuron 的 OpenAI 面也活着**（`/health` → healthy，`/v1/models` → 25 个模型）、**端脑会话创建成功**（200 + RFC3339 `created_at`，正是 AGENTS.md ⑲ 里记的那个 wire 形状）—— **但发消息断在叶区 → LLM**：`messages` 与 `messages:stream` 都返回 `502`，错误把根因说得很清楚 —— `Failed to get models: error sending request for url (http://localhost:60080/v1/models)`。`localhost:60080` 是**桌面 sidecar 的端口**，移动端上没人监听。③ **根因 = 「改了一套存储、调用读的是另一套」**（**桌面端有完全相同的 bug**）：`NativeLobeRegistry` 同时持有 `inner`（`Arc<dyn NativeLobe>`，**shadow API 走这条**）与 `runtimes`（`LobeRuntime`，带 `openai_base_url`）；`reconfigure` / `point_lobes_at_neuron` 改的是**后者**，而 `build_lobe_client_with` 拿的是**前者**，且 `LobeClient::NativeWithConfig` 自己读环境变量 `TELENCEPHALON_NEURON_URL`、读不到就退回硬编码 `http://localhost:60080` ⇒ **宿主的端点配置对实际调用路径完全无效**。**修在上游 `telencephalon`**（`src/a2a/skill_router.rs`）：新增 `LobeClient::NativeAt(lobe, config, url)` 变体，**端点跟着 client 走**（由宿主在构造时给，取自 registry 的 runtime），环境变量只作兜底；配 2 条回归测试（端点必须真的到 client 上 / 永远不许退回死端口）。④ **⚠️ 还差最后一环**：neuron `available_count = 0`（无本地模型），而 **neuron 的所有 LLM 后端（candle/litert/mistralrs/llamacpp/remote）都靠环境变量选**，**App 进程注入不了环境变量**（Android zygote 决定）⇒ **「移动端怎么给 neuron 配 LLM」是条真问题**；现有 `model_download_service.dart` 走 LiteRT `.litertlm`（Kotlin 侧），与 neuron 的 candle/gguf 是**两套引擎、接不上**。
**Updated:** 2026-10-30 (⑱ **海马体 per-agent 鉴权 +「单向上行备份」措辞**（用户拍板「开始」，两件小事）：① **服务端加鉴权中间件** —— `hippocampus-server` 新增 `src/auth.rs`：`HIPPOCAMPUS_AUTH_TOKENS="tok-alice:alice,tok-bob:bob"` 把 bearer token 绑到租户（`Authorization: Bearer` 或 `X-Hippocampus-Token`），`/api/*` 全部走 `auth::authenticate`（`/health` 除外）；**租户藏在三个地方**，中间件三处都绑 —— path（第三段是租户的集合：`sessions`/`tasks`/`mental-models`/`scheduler`）、query（`?tenantId=`）、JSON body（`{"tenantId":…}`）；**冒名别的租户 → 403，没带租户 → 注入 token 的租户（不再有共享的 `default` 桶）**。请求侧字段是 **camelCase `tenantId`**、响应侧 `Memory.tenant_id` 是 **snake_case** —— 历史事实，别写混。不设那个环境变量 = **可信本地模式**（无鉴权、租户仍来自请求），端脑内嵌副本与测试依赖这个默认。② **顺手补上「按 id 直取」的洞**：`GET/PUT/DELETE /api/memory/{id}` 三个 handler 只按 id 取数（`storage.get_memory(&uuid)`），手里没有租户可比 ⇒ 中间件放行前自己查一次那条记忆的 `tenant_id`，不属于本租户就 403（`auth::guard_memory_tenant`）—— uuid 不可猜，但拿到 id 就能读/改/删别人的记忆。③ **发现并修掉一个真坑**：`build_router_unit` 原本会读环境变量，而 **10+ 个测试文件与端脑内嵌的那份海马体（`encephalon/src/a2a_server.rs`、`telencephalon/src/test_harness.rs`）都走它** ⇒ 本机设了那个变量，测试会全 401、端脑会被自己的内部调用打穿。现在语义拆开：**只有独立进程读**（`hippocampus-server` 的 `main.rs` → `build_router`），`build_router_unit` = 可信本地模式（内嵌副本 + 测试）。④ **⚠️ 三个还没解决的，都写进 `hippocampus/AGENTS.md` 了**：(a) **token 的租户会覆盖客户端声明的租户** —— 中间件里 token 是权威，客户端声明的 `tenantId` 只是断言，不一致就 403 ⇒ **开了鉴权客户端就选不了租户了**；桌面端「每人一个助理各用自己的 tenant id」要继续成立，**得每个人格配一个 token**（谁生成、怎么分发，是还没定的设计决定）。不过按 (c) 的链路图，桌面端/移动端今天走的是内嵌副本、不受鉴权影响 ⇒ 这条真正咬人的是端脑那条走 `HIPPOCAMPUS_HOST` 的路（它固定声明 `tenant_id = "default"`）。(b) **`GET /api/decisions/{id}` 仍会跨租户漏** —— `GraphDecisionStore::get(id, Some(tenant))` 找不到时**回退遍历所有租户**，`supersede`/`causal_chain` 同样不过滤租户，要堵得改 `DecisionStore` 语义（代价：老 `default` 桶里的 decision 会不可见）；(c) **只有一条链路真的需要 token**：桌面端与移动端走的是**端脑内嵌的那份**海马体（`build_router_unit`，可信本地模式）⇒ **不受鉴权影响**；真正撞上的是**端脑自己的 HTTP 客户端**（`telencephalon/src/hippo_store.rs` / `hippo_mirror.rs`）—— 地址由 `resolve_hippocampus_url` 决定，**走 `HIPPOCAMPUS_HOST` 时连的是另一台设备上的独立 hippocampus-server**（这正是「多设备共享记忆」那条路），这条必须发 `Authorization` 头。⑤ **文档措辞**：`local_s3_sync` 改写成「**单向上行备份**」—— 方向是 local→remote，远端副本被本地覆盖（`deep_clone(dst, src_version)`），**不是共享存储**；Lance dataset 是**单写者**（存储层只在进程内用 `pending` 锁串行化，全仓无跨进程文件锁），多进程指向同一份数据根目录会**丢写** ⇒ 跨设备共享记忆的正确形态是**跑一个海马体服务**、客户端走局域网/零信任网络连它、用 `tenant_id` 区分 agent，而不是复制数据平面。**验证办法值得单独记一笔**：lance/datafusion 那个依赖树从零编要半小时以上，于是另搭了一个**隔离验证台**（临时目录里的最小 cargo 工程 + 一个假的 storage，用 `#[path = "…/auth.rs"]` **直接编译真实的那份 auth.rs**、不复制不漂移），1 分 17 秒就编完、**22 个用例全绿**（12 个单测 + 10 个中间件行为测试：无 token 401 / 冒名 403 / 省略租户被注入 body 与 query / path 租户被改写 / 跨租户按 id 取被 403 / 未知 id 不算鉴权错 / 可信本地模式原样放行）—— 中间件逻辑**不必等整栈编译**就能验，这招以后还用。⚠️ 验证台当场就抓到一个真差异：它第一版把 `/health` 和受保护路由放进了同一个 router，`/health` 于是也 401 —— 真实现里 `/health` 在**外层** router、不带中间件，形状对不上就得出假故障。真实仓的 e2e（`hippocampus-server/tests/auth_e2e.rs`，11 例，走真 Lance 存储）**已实测全绿**：新基线上 `cargo test -p hippocampus-server --lib --test auth_e2e` → **12 单测 + 11 e2e 全绿**，EXIT=0（e2e 真建 dataset、真写真读，不是 mock）。)
**Updated:** 2026-10-29 (⑰ **cerebellum 概念退役 —— 仓库判为过时并删除**：这一条把「小脑」从神经解剖命名体系里彻底摘掉。① **定性依据（三条都实测过）**：**仓内零代码**（只有 README / AGENTS / LICENSE / .gitignore 共 4 个文件）；**工作流职能 2026-10-14 已整体迁入端脑**（`telencephalon/crates/workflow-{schema,runtime,engine,trace}` + `apps/editor` + `docs/workflow/`，两仓同步 ahead/behind=0）；**剩下的「具身智能预留」是个零实现零 roadmap 的空占位**（全栈 `Cargo.toml` 无任何 path 依赖、`.github/workflows` 无引用、代码文件零命中 —— 唯一命中的是 `telencephalon/apps/editor` 里沿用旧品牌的 `Cerebellum Workflow Studio` 标题与 `cerebellum-editor` 包名，以及 `shadow/benchmark/src/runner.rs` 里一个叫 `cerebellum-bench` 的临时目录名，两者都与该概念无关）。② **有用的文档没有跟着仓一起消失 —— 已归到端脑**：cerebellum 的 AGENTS.md 里有一批**端脑侧完全没记过**的东西（`telencephalon/AGENTS.md` 搜 `workflow-engine` / `apps/editor` / `Phase 2` **零命中**）：四个 crate + 编辑器 + 设计文档的迁移落位表、`flow`（Coze 式 DAG 运行时）与 `workflow`（语义与 authoring 层）的分工互补关系、**「端脑中的 agent 也是 flow 中的一环」公理**（用户 2026-10-14 定的，已落地在 `flow/adapter/lobe.rs` + `flow/adapter/a2a.rs`）、以及 Phase 2 待办（workflow 作为 authoring/溯源层桥接到 flow 执行引擎，agent 节点 1:1 映射 LobeAdapter/A2aAdapter）⇒ 已写进 `telencephalon/AGENTS.md` 新增章节「Workflow 栈 — 与 `flow` 子系统分工」+ Modules 表补两行。③ **顺手改正了 4 处过期指针**（都还在指向 cerebellum）：`parietal/README.md`（中英双语各一条）、`parietal/AGENTS.md`、`shadow/shadow-desktop/AGENTS.md`（"backend lives at cerebellum/apps/editor"）、`telencephalon/Cargo.toml` 顶部注释（原文说 cerebellum "reserved for embodied intelligence"）—— 现在统一指向 `telencephalon`。④ **没动的东西（有意为之）**：`shadow/docs/superpowers/architecture/2026-09-25-*.md` 是带日期的历史评估快照，按项目惯例不改写为现状。⑤ **编辑器的「小脑」品牌已一并退役（用户拍板「全改并迁移 storageKey」）**：页面标题 → `Workflow Studio`、包名 `cerebellum-editor` → `workflow-studio-editor`、`<title>` 同步；**storageKey 迁移契约**（抽到 `apps/editor/src/storage.ts`）：旧键 `cerebellum.workflow.<name>` → 新键 `workflow.studio.<name>`，规则是「新键命中则权威并清旧键 / 新键缺失或损坏则回退读旧键并搬过去 / 搬完即幂等」—— **用户本地草稿不会丢**；零依赖回归测试 `src/storage.test.ts`（node 内置 runner，`pnpm test`，8 例全绿）守着这条契约。⑥ **远端 `iBLOC/cerebellum` 私有仓保留未删**（用户 2026-10-30 决定）：删仓需要 `delete_repo` scope，而 OAuth token 拿这个 scope 必须账号本人在网页上授权（`POST /user/tokens` 对 OAuth token 恒 404，自动化绕不过去），用户选择「这轮先不删」⇒ 远端仍是旧的「具身智能预留」措辞，**本机已无该目录**（`C:\Projects\iBLOC\cerebellum` 内容已全部可恢复删除，只剩一个被外部进程占住的空目录）。
**Updated:** 2026-10-29 (⑯ **CI 剩余红的定性 + 两道新障碍（runner 磁盘写满 / Actions 额度用尽）**：这一条把「三仓 CI 为什么还是红」逐个 job 查到了根，并给出「哪些是既有欠账、哪些是本轮配置问题」的对照结论。① **shadow 两个 Rust job 的红不是代码问题，是 runner 磁盘写满**：`Desktop E2E` 编端脑 server 时 runner 直接死掉，**日志整个传不回来**（job 只走到 `Build the 端脑 server` 那一步，`gh run view --log` 报 "log not found"）—— 真正的证据在 check-run 注解里：`No space left on device : '/home/runner/actions-runner/cached/.../Worker_*.log'`；`Prefrontal Rust` 则是链接阶段 `collect2: fatal error: ld terminated with signal 7 [Bus error], core dumped`（磁盘满的典型症状）。⚠️ **这个坑的隐蔽性在于「日志没了」** —— runner 被掐死时 GitHub 连日志都传不回来，只能靠 `gh api repos/<repo>/check-runs/<id>/annotations` 拿注解（注解在 run 结束前就有）。修法（shadow `9786098`）：**删掉 runner 预装但用不上的工具**（`/usr/share/dotnet` `/opt/ghc` `/usr/local/share/boost` `/usr/local/lib/android` `/usr/share/swift` `/usr/local/share/powershell` + swapfile，腾 ~10GB）+ `CARGO_PROFILE_{DEV,TEST}_DEBUG=0` / `CARGO_INCREMENTAL=0`（调试信息是 `target/` 的大头）+ 两个 Rust job 加 `timeout-minutes: 60`。② **rust-cache 的 `workspaces` 必须逐行写，不能逗号分隔** —— 逗号分隔会被当成**一个**路径，缓存直接失效（`Error: The cwd: .../prefrontal,synapse,hippocampus,neuron does not exist!`），于是每次都从零重编整栈，又慢又撑爆磁盘；shadow 原先正是逗号分隔（telencephalon 早就用 `workspaces: |` 块标量写对了）。③ **rustfmt 漂移是全栈既有欠账，不是工具链升级引入的** —— 这条做过一次反向验证：**diencephalon 的 `rustfmt` job 至今仍钉在 `dtolnay/rust-toolchain@1.85`，照样红**（step 3 工具链 success、step 4 `cargo fmt --check` failure），所以「把 `@1.85` 换成 `@stable` 导致格式漂移」这个假设被排除；telencephalon 自己 crate 里 stable 下有 **78 个文件**漂移，而 `cargo fmt --all` 会顺着 path 依赖图**穿透到兄弟仓**（encephalon 的 fmt job 实际在校验 `telencephalon/tests/*.rs`）⇒ **要治就得全栈一起治（实测 346 个文件：synapse 278 / telencephalon 172 / prefrontal 148 / neuron 68 / diencephalon 20 / encephalon 3），单仓 `cargo fmt` 横扫不了**（它会顺手改别人的仓，还会撞上 neuron 里别人的 WIP）。④ **telencephalon 的 `Cargo Check` 只卡在一个文件**：`tests/shadow_api.rs` 还在用 Postgres 时代的 API（`sqlx::PgPool` + `LobeStore::new(pool)` / `WasmBinaryStore::new(pool)` / `McpStore::new(pool)`），而这些构造器早已迁到 in-memory（`LobeStore::new()` 无参、另有现成的 `state::build_test_state()`）⇒ 13 个同类遗留测试文件（`a2a_gateway` / `api_smoke` / `business_flows_e2e{,_part2,_part3}` / `lobe_config_e2e` / `lobe_register` / `prefrontal_register` / `shadow_api` / `shadow_interaction` / `wasm_a2a_e2e` / `wasm_e2e` / `flow_blob_db`）；库本身是干净的（75 warnings / 0 errors）。⑤ **⚠️ 现在 CI 起不来了 —— Actions 额度用尽**：org `iBLOC` 是 **Free 套餐**，私有仓的 Actions 分钟配额被打满，新 run **秒失败**：`The job was not started because recent account payments have failed or your spending limit needs to be increased` —— **这是账号级账单设置，代码侧无解，需要本人去 https://github.com/organizations/iBLOC/settings/billing 提额/加支付方式**（顺带一提：billing API 现在 410 搬家了，`/orgs/<org>/settings/billing/actions` 要 `admin:org` scope、`/users/<u>/settings/billing/actions` 要 `user` scope，本机 `gh` 两个都没有，所以**连「还剩多少分钟」都读不出来**）。⑥ **本轮实测的三个仓最终状态**：shadow `Desktop Build` / `Desktop Tests` / `Mobile Test` / `Mobile Analyze` **四个绿**，`Desktop E2E` + `Prefrontal Rust` 红在磁盘（已修，未能验证）；telencephalon 6 个 job 全红（fmt 漂移 / clippy 弃用警告 / 那 13 个遗留测试文件）；encephalon `rustdoc` **绿**、其余 3 个红（fmt 穿透兄弟仓 + clippy）。**根因定性：合并前的基线 run 里，这些 job 全部红在「Require cross-repo token」这一步**（telencephalon `21ef802`、encephalon `3947761` 的 fmt/check 步骤全是 `skipped`，压根没跑到）⇒ **token 这一修不是把 CI 弄红了，而是让一批从未被执行过的欠账第一次露了面**。)
**Updated:** 2026-10-29 (⑮ **CI 的 secret 名字 +「本地绿 / CI 红」的行尾陷阱** —— 这轮把三仓 CI 从「缺 secret」一路推到只剩「既有的格式/clippy 欠账」：① **secret 叫 `IBLOC_TOKEN`（单 K，源自组织名 iBLOC）** —— 三个仓的 workflow、`AGENTS.md`、架构文档全用这个拼法。**写成 `IBLOCK_TOKEN`（双 K）的话，secret 建了 workflow 也读不到**（GitHub 静默给空值）—— 这个坑极隐蔽，值得单独记一笔。② **token 已由我设进三个仓**（`gh secret set IBLOC_TOKEN`）：用的是本机 `gh` 的 OAuth token（`gho_`，scope `repo`/`workflow`）。**GitHub 不允许用 OAuth token 调 `POST /user/tokens`**（实测 `GET`/`POST` 都是 404）⇒ 最小权限的细粒度 PAT **只能由账号本人在网页上用密码 + 2FA 生成**，自动化绕不过去；现在这个是**账号级读写权**（泄漏面覆盖全部私有仓），想收紧就在 https://github.com/settings/personal-access-tokens/new 建一个「Contents / Workflows 只读 + 限定那 8 个仓」的 PAT，再 `gh secret set IBLOC_TOKEN --repo iBLOC/<repo>` 换掉即可。⚠️ **写 secret 必须用 `--body` 而不是管道** —— `gh secret set` 从 stdin 读值时**不 trim**（源码就是 `io.ReadAll(stdin)`），而 PowerShell 管道会给字符串补 `\r\n` ⇒ secret 的真实值带尾部换行。这个坑的表现极阴险：`actions/checkout` 自己会 `TrimSpace` 所以 9 个兄弟仓 checkout **全部成功**，但把 token 嵌进 URL 的步骤会因多一个 `\r` 而 `Authentication failed`，且 git 的报错会把 userinfo 去掉、看不出改写到底生效没有。③ **「本地绿 / CI 红」的真凶 = 生成物行尾**：生成器给移动端 Dart 产物硬编码 `eol: '\r\n'`（注释还写着「移动端 Dart 源码是 CRLF」），比对又是逐字节相等；而仓里所有 blob 都是 LF（`git ls-files --eol` → `i/lf`，无 `.gitattributes`）⇒ Windows 的 `core.autocrlf=true` 让工作树检出成 CRLF，**恰好蒙对**；CI（Linux）检出是 LF ⇒ 必判漂移 ⇒ `Desktop Build` 这个 job 长期红、本地跑多少遍都复现不出来。修法：新增 `scripts/lib/eol.mjs`，生成物**一律 LF 落盘**、比对时 `normalizeEol` 归一化（gen_tokens / gen_nav / check-agent-surface 三个脚本统一走它），并加契约测试 `shadow-desktop/tests/generatedEol.test.ts`（4 例，**已反向验证**：把 CRLF 硬编码放回去测试确实红并点名文件）。**同类坑有两处** —— 除了三个 scripts/ 生成器，`brand/gen-icons.mjs` 也给 `ShadowMark.tsx` 硬编码了 CRLF（`Brand asset drift check` 同样在 CI 上必红、本地永远绿），一并归一化，契约测试的扫描范围也覆盖到它。验证：LF 工作树（= Linux CI 的真实条件）与 CRLF 工作树**双态**下三个校验全 exit 0；桌面 `tsc` exit 0 + vitest **113 文件 / 1144 passed / 2 skipped**。④ **secret 通了之后露出的第二道坎 = cargo 拉私有 git 依赖**：synapse 的 `ziti` feature 指向**私有的 `iBLOC/ziti-rust`**，`actions/checkout` 的 token 只作用于 checkout 步骤，cargo 自己的 git fetch 没有凭据 → `failed to authenticate when downloading repository`。关键细节：**cargo 默认用 libgit2，而 libgit2 不认 `url.<base>.insteadOf`** —— 必须先让 cargo 改用 git CLI（`~/.cargo/config.toml` 里 `[net] git-fetch-with-cli = true`），`insteadOf` 改写才生效。顺带 **protoc**：`lance-encoding` 的 build script 要它（`prost_build` 编译 .proto），runner 镜像不保证带 protobuf 编译器，缺了就直接挂在 build script（本地也要把 `PROTOC` 指到 vendored 的 `protoc-bin-vendored`）。修法：三个仓的 CI 每个 Rust job 加一步 `Prepare Rust dependencies`（`::add-mask::` 掩掉 token + `git-fetch-with-cli` + `insteadOf` + `apt install protobuf-compiler`）；`encephalon` 的 CI 里 **`Checkout synapse` 还漏了 token**（私库用默认 GITHUB_TOKEN 必然失败），一并补上。⑤ **剩余的红是既有的、不是这两轮造成的**：telencephalon / encephalon 的 `fmt` + `clippy` + `test` 在**合并前的 master 上就已经全红**（用各自合并前 SHA 的 CI 运行逐 job 核对过）；`cargo fmt --all` 会顺着 path 依赖图遍历全栈 ⇒ 漂移文件共 **346 个**（synapse 278 / telencephalon 172 / prefrontal 148 / neuron 68 / diencephalon 20 / encephalon 3）—— **不能靠一次 `cargo fmt` 横扫**，那是独立工程)
**Updated:** 2026-10-29 (⑭ **通信链路改造：所有通信走 大脑 → 端脑 → 叶区**：用户定调「所有的通信都要走大脑 端脑 叶区，两个客户端都需要维持这个链路」—— 这条把上一轮悬着的「桌面端对话要不要改走端脑」直接定了。① **改之前的实测现状**：端脑 → 叶区**真的**经过叶区（`api/shadow.rs` 的 `send_message_stream` 从 `lobe_cache` 取叶区 → `SkillRouter::build_lobe_client_with` → 进程内 `LobeClient::NativeWithConfig`）；移动端**本来就在链路上**（`chat_provider.dart` 走 `/shadow/v1/conversations`）；**桌面端是唯一缺口** —— `telencephalonClient.ts` 的 `isTauri()` 分支让对话直连 neuron（`streamMessageNeuron` + `neuron_infer` Tauri 命令）、会话是本地桩（`newLocalConversation`），于是**桌面端永远收不到 `tool_call`**（这正是「影子给客户端换主题」在桌面端不成立的根因）；桌面端 sidecar 也**只挂了海马体**（`hippo_http.rs`），端脑的 HTTP 面根本没起。② **桌面端 sidecar 起完整端脑面**（新增 `src-tauri/src/cortex_http.rs`，删掉 `hippo_http.rs`）：`telencephalon::boot::build_app_state(Some(stack.neuron().as_ref()))` + `telencephalon::api::build_full_app(state, conv_store, Some(neuron.router()), Some(hippocampus.router()))` → 挂在 `127.0.0.1:60080`，**形状与独立运行的端脑完全一致**（前端一行没改 —— `DEFAULT_BASE_URL` 就是这个端口）。三个决策：**海马体只有一份**（`encephalon` 的 `hippocampus` feature 在桌面端关掉 —— 两份 Lance 指向同一份存储会抢锁，海马体状态由 `build_app_state` 建、路由从**同一个** state 挂出来）；**叶区指向活着的那个 neuron**（`neuron::create_router` 每次调用都**重建** `ServerState`，所以装配完用 `state.native_lobes.reconfigure(name, stack.neuron_addr())` 把三个叶区的 LLM 端点显式改到 `:8085`）；**`telencephalon` 必须 path 依赖且与 `encephalon` 同目录**（两份端脑 = 两套 `AppState` 类型，传不过去）。③ **前端去旁路**：删掉 `newLocalConversation` / `streamMessageNeuron` / `pickNeuronModel` / `neuronHistory` / `NEURON_CHAT_MODEL_FALLBACK`；`createConversation` 与 `streamMessage` 恒走端脑；`health()` 从探 neuron 改成探端脑 `/api/telencephalon/status`；**Tauri 命令 `neuron_infer` 整个拆掉**（链路不留后门；`AppState.embedded_stack` 降级为「钉住大脑生命周期」，标 `#[allow(dead_code)]`）；人设改走**会话创建**（`composeSystemPrompt(persona)` → `createConversation({ system })`），与移动端同一机制。④ **端脑 PR 补上下文转发**（用户拍板「端脑提 PR」，不是客户端兜底）：端脑仓是他人 WIP（master 84 dirty）⇒ 走已有 worktree `telencephalon-wt-feat` 的 `feat/shadow-system-prompt` 分支（**PR #1 已开**），复用**已有 metadata 通道**（shadow API 把 metadata map 打包进 `metadata["name"]`，叶区 `decode_metadata_from_name` 还原 ⇒ **不改 wire format**）：新增 `"history"` 键转发先前几轮 + `history_of()`（跳过系统提示词那条、`TurnRole::User→"user"`/`Agent→"assistant"`、**最旧在前**、两条上限 `MAX_HISTORY_TURNS=20` / `MAX_HISTORY_CHARS=12000`，超出**先丢最旧的**）+ 叶区侧 `extract_history()` / `llm_messages()`（system → 历史 → 当前轮最后）。⚠️ **端脑仓本地构建要 protoc**（`lance-encoding` 的 build script）：本机没有系统 protoc，但 cargo registry 里有 `protoc-bin-vendored-win32-3.3.0` ⇒ `$env:PROTOC="$env:USERPROFILE\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\protoc-bin-vendored-win32-3.3.0\bin\protoc.exe"`。⑤ **移动端**：删掉本地直连死路径 `lib/agents/main_agent/main_agent.dart`（`MainAgentNotifier` 直接拿 `ModelEngine`（本地 MNN）跑推理，**全仓无消费者**，留着就可能被重新接上），连带移除 `mainAgentProvider`（`main_agent_prompt.dart` 保留 —— 提示词设置页在用它的默认人设）；**人设接进会话创建**（`chat_provider.dart` 之前 `createConversation()` **不带 system**，提示词设置页存的人设根本没进链路；现在用 `String? Function()` 传，改人设不重建 `ChatNotifier`）。⚠️ Dart 坑：初始化列表里写 `() => null` 会被解析成**构造器体**（`=>` 在初始化列表里有别的含义）⇒ 必须用具名函数。⑥ **守门员** `scripts/check-brain-chain.mjs`（接进 CI `Brain chain check`）：6 条规则拦「客户端直连推理 / 平台分支旁路 / sidecar 没挂端脑面 / 又暴露 infer 命令 / 移动端不走端脑 / 移动端留本地直连编排器」。**三个实现坑**：① **只认代码行不认注释**（这个仓的注释里经常**解释**被禁的东西，拿注释当证据会满屏误报）；② **不要手写注释词法分析器**（曾写状态机，遇到 Rust 的**跨行字符串续行**（`tracing::info!("... \` 换行`）时字符串状态跨行断裂，把后面代码整段当注释吃掉，且这种坑只在某个文件出现一次极难定位）⇒ 改**行级判定**（行首 `//` / `*` / `/*` 就跳过）；③ 白名单 `openaiClient.ts`（**云端供应商 / 语音**客户端，生产代码只被 `tts.ts` 用，不是对话链路）。**反向验证**：塞两个探针（桌面 `neuron_infer` + 移动 `MainAgentNotifier`）→ **exit 1** 并精确点名两个文件；删掉 → **exit 0**。⑦ **连带修掉的既有缺陷**：桌面 vitest 的 `ConversationPageTokenStats.test.tsx` 的模块 mock 必须补 `composeSystemPrompt`（人设改走会话创建后页面会调它）—— 新链路的副作用被测试抓到了；`src-tauri/src/lib.rs` 里过时注释「chat goes in-process via neuron_infer」已改正。验证：桌面 `tsc --noEmit` **exit 0** + vitest **112 文件 / 1140 passed / 2 skipped** + `build:web` **exit 0** + `cargo check --tests` **exit 0**；移动 `analyze` **0 error**（89 issues 与基线一致）+ `flutter test` **247/247 全绿**；`check-brain-chain` **0 阻断**（反向验证 exit 1 生效）、`check-agent-surface` **0 阻断 / 0 提示**。⚠️ **遗留**：**端脑 PR #1 待合并** —— 合并前桌面端的人设**到不了模型**（端脑只把 system 记在会话里、不往下传），链路的**形状**对了但叶区要等 PR；多轮上下文同理；**真机未验**（设备失联）；**云端供应商还没进叶区**（叶区 LLM 端点只有一个）；`/v1/chat/completions` 仍挂在端脑根上（与独立端脑同形状）属已知冗余。设计全文 `docs/superpowers/architecture/2026-10-29-brain-chain.md`)
**Updated:** 2026-10-29 (⑬ **全新 logo 定稿「蚀」+ 两端图标全量换装**：承接第 ⑥ 条「影子本身没有颜色」的品牌原则 —— **影一律中性色，只有「光」吃主题色槽位**（`--logo-accent`，默认 `#71717A`，用户可覆盖）；**发光是实时信号不是装饰**；三层语言 Umbra 本影 / Penumbra 半影 / Caustic 焦散在 logo 上直接落成「本影实心块 + 焦散亮缝」。① **几何必须脚本生成**（不手画 SVG 路径）：`brand/geom.mjs` = 唯一真相源（调色板 `INK_LIGHT #09090B` / `INK_DARK #52525B` / `ACCENT #71717A` / `TILE_LIGHT #F4F4F5` / `TILE_RADIUS 112`，`circleIntersect` / `arcSpec` / `crescentPath` / `lensPath` / `innerArc`，四套方案 `CONCEPTS`）→ `brand/gen-logo.mjs` 产品牌 SVG 与预览、`brand/gen-icons.mjs` 产平台图标，两端 SVG 与 PNG **同源不许走样**，CI 新增 `Brand asset drift check`（`node brand/gen-icons.mjs --check`，**已反向验证**：改坏生成物 exit 1、重跑 exit 0）。② **零依赖光栅化** `brand/raster.mjs`：自写解析式扫描 + 4×4 超采样抗锯齿 + 手写 PNG 编码（IHDR/IDAT/IEND + CRC32 + adler32，`node:zlib`）—— 因为要逐像素验证「亮缝是否真落在影体内」这类几何断言，而环境没有可用位图库。③ **方案推导走了两轮**：第一轮（渐细月牙 / 横杠 / 禁止号斜杠）**全部淘汰**；第二轮四套 = 蚀 / 隙 / 环核 / 弧，**用户最终选「蚀（日月相蚀）」**，并补两条：白天日亮月暗、黑夜月亮日暗（**同一份几何只换两笔颜色角色**，形态不变、观者自己读出昼夜）；单色版**影与光之间留一道可见的缝**（否则两个咬合的圆糊成一块）。④ **用户反馈「有点丑，两个圆再近一些」后的定稿几何**：front 月 `(233,256) r150` 圆满在前，back 日 `(279,256) r150` 被遮在后，**圆心距 46**（日轮退成挂在月盘右缘的细月牙，恢复「主体压暗、光只占一条边」的观感）；单色版 `gap=20`（512 单位 → 16px 约 0.6px）；`bbox=[83,106,429,406]`。⑤ **渲染期自查修掉 4 个真 bug**：`fill-rule="evenodd"` 画两个交叠圆 = **对称差**（两片月牙）不是「A 减 B」→ 单片月牙必须显式两段弧接成闭合路径；暗底层级反了（光比影暗）→ 暗底影改 zinc-600、光用主题色提亮版；弧方案的焦散线「像条虫子」→ 改成贴着影内缘的**亮带**（`annulus ∩ disc`，SVG 用 `clipPath`，并用探针脚本实测 r=150..184 全在影内）；PNG 解不开是因为把 `zlib.deflateSync` 的输出（**已是完整 zlib 流，自带 header + adler32**）又包了一层 → 改为直接用。⑥ **平台资产全量换装**：`brand/icon/app-icon.png`(1024) → `pnpm tauri icon` 生成全套 Tauri 图标；桌面端 favicon 从 **Vite 默认 `/vite.svg`** 换成 `/pwa-icon.svg` + PNG 192 fallback，`theme-color` 由旧青蓝 `#06b6d4` 改 `#0A0A0B`，`manifest.web.json` 的 `theme_color`/`background_color` 同步；应用内 logo 用**生成物** `src/components/brand/ShadowMark.tsx` + `index.css` 的 `.shadow-mark`（亮底 `front=--logo-ink` / `back=--shadow-accent`，`.dark` 下两笔角色互换），侧栏 lucide `Brain` 占位与 SetupPage 的 `Server` 占位一并替换（去掉原 `bg-primary` 底块）；移动端 Android `mipmap-*/ic_launcher*.png` 全套重生成（原来是 **Flutter 默认 F 图标**），自适应图标前景用**位图**（`@mipmap/`）而非矢量（VectorDrawable 的 `<group>` transform 顺序不确定），背景从旧深蓝渐变改中性 `#F4F4F5`。⑦ **顺手修掉 3 个既有缺陷**：`manifest.web.json` 引用的 3 个 PWA 图标**仓库里根本不存在**（192 / 512 / monochrome-512 全缺）；favicon 一直指着 Vite 模板图标；Android 启动图标一直是 Flutter 默认图标。⑧ **令牌接线**：`design-tokens.json` 新增 `color.brand.logo`（inkLight / inkDark / tile / tileRadius），`scripts/lib/tokens.mjs` 投影 `--logo-ink`（`:root` 亮 / `.dark` 暗）与 `logoInkLight` / `logoInkDark` / `logoTile`（Dart 侧）。⑨ **两个坑要记住**：JS 块注释里出现 `mipmap-*/` 会**提前闭合注释**（改写 `mipmap-<dpi>/`）；`--check` 的 `process.exit(1)` 必须放在**所有写入调用之后**（放函数定义后会导致 drift 恒为 0）。⚠️ **遗留**：Windows 托盘模板图标未做（托盘仍显示浅底彩色方块，`.ico` 需结构级支持）；移动端**应用内没有 logo 位**（只换了启动图标）。验证：桌面 `tsc --noEmit` **exit 0** + vitest **112 文件 / 1140 passed / 2 skipped** + `build:web` **exit 0**；移动 `flutter analyze` **0 error**（89 issues 全是存量 info）+ `flutter test` **247/247 全绿**；`gen_tokens --check` / `gen_nav --check` **0 过期**、`check-agent-surface` **0 阻断 / 0 提示**、`gen-icons --check` **0 漂移**（反向验证 exit 1 生效）；浏览器实测 `brand/preview.html` 内联 SVG 与解析光栅图**完全一致**、独立 `brand/logo/eclipse.svg` 也能正确渲染、`vite preview` 起服后 `/setup` 页暗色模式下 `.dark` 角色互换生效。设计全文 `docs/superpowers/architecture/2026-10-29-shadow-logo.md`)
**Updated:** 2026-10-29 (⑫ **桌面端「够得到海马体」+「主题色就是记忆」**：接着上一条的记忆路径修复，本轮补上两件让愿景能真正落地的事。① **重大发现：桌面端 Tauri 构建的对话根本不过端脑** —— `telencephalonClient.ts:665-673` 的 `streamMessage` 在 Tauri 下走 `streamMessageNeuron`（直连进程内 neuron 的 `/v1/chat/completions`），`createConversation` 走 `newLocalConversation` 本地桩 ⇒ 桌面端**压根不产生 `tool_call` 事件**（neuron 的 chat completions 不带 tools），端脑的意图路由 / 工具 / flow 在桌面端**全部不在链路上**；移动端相反（嵌入式大脑带端脑、`cortex_router` 在链路上）⇒ **批次 A 先在移动端落地是可行的**，桌面端要先做一个「对话要不要改走端脑」的架构决定。② **Tauri sidecar 只起了 neuron 的 HTTP（:8085），端脑的 HTTP 面没起** → 前端够不到进程内海马体 → 新增 `src-tauri/src/hippo_http.rs`：把 `hippocampus_server` 的 router `nest("/hippocampus")` 挂到 `127.0.0.1:60080`（= 前端 `telencephalonStore.ts` 的 `DEFAULT_BASE_URL`，**前端一行不用改**），前缀与端脑自己的挂法一致（`telencephalon/src/api/mod.rs:160`）⇒ 同一套客户端代码两端通用；CORS 放开（同 neuron）；端口被占用**不算错**（说明外部已有端脑在跑，前端本就该连那台）；**只挂海马体**，不挂端脑其余的面。③ **顺带修好一个既有坏测试**：`src-tauri/tests/embedded_stack.rs` 用 `neuron_lib` 但 `Cargo.toml` 从来没有 `neuron` 依赖 → `cargo test` 编不过（**HEAD 就是坏的**，与本轮无关）；妙的是 **`Cargo.lock` 里一直登记着 `axum`/`hippocampus-server`/`neuron`/`tower`/`tower-http`** —— 是 manifest 被削过而锁没跟上，补回依赖后**锁零改动**、两边重新对齐（`neuron` 必须用**同一个 git 源** `git = ".../ibloc/neuron", branch = "main"`，用 path 会编出两份 neuron、类型对不上）。④ **「主题色也是记忆的一部分」第一次真正落地**：`themeStore.setAppearance` 改色 → 写一条海马体记忆（`uri = 'preference://theme/accent'`、`dimension = Agent`、`content = '#rrggbb'`）；`App.tsx` 启动 → `hydrateFromMemory()` 读回并应用；读不到（端脑没起 / 离线）静默用本地那份；坏值被 `appearanceMemory.ts` 的 hex 校验拦掉。海马体没有 upsert 也没有「按 uri 查」⇒ `HippocampusClient.upsertMemory` 做「列出来按 uri 匹配 → 命中 PUT / 没命中 POST」，**一条稳定 uri**（偏好是当前值，不是历史流水）。⚠️ **移动端还做不到**（移动端脑不带海马体，`HippocampusClient` 在移动端还是空壳）。验证：sidecar `cargo check --tests` **exit 0**、`cargo test --lib hippo_http` **1 passed**、桌面 `tsc --noEmit` **exit 0** + vitest **112 文件 / 1140 passed / 2 skipped**（新增 8 例 `tests/stores/appearanceMemory.test.ts`）、**`Cargo.lock` 零改动**。设计文档同步补 §1.1b（桌面端不过端脑）与 §3bis（两批落地）)
**Updated:** 2026-10-29 (⑪ **桌面端记忆路径修复 + 「影子外观与人格」设计定调**：用户提产品愿景「影子作为个人助理，支持 agent 自定义客户端主题色；用户可向影子要求换颜色 / 生成背景图设为聊天背景；影依托海马体记忆有自己的人格与喜好」，问卷定了三条 —— 背景图**云端/端侧双模式**、人格落**海马体 `dimension=Agent`**、**主题色也是记忆的一部分**且多端只在零信任网络里共享海马体、后续支持**一个海马体存多个人格**（家庭：只部署一个海马体，每人各有一个助理）。**本轮落地 = 桌面端记忆读/写路径修复**（人格落海马体的前置）：① 新增 `shadow-desktop/src/lib/hippocampusClient.ts` —— 桌面端**没有独立海马体进程**，海马体嵌在端脑里（`encephalon` 的 default features 含 hippocampus，`telencephalon/src/api/mod.rs:160` 把它 `nest` 在 `/hippocampus` 下），所以正确地址是 `{端脑}/hippocampus/api/*`；旧 store 打的是 `http://localhost:8081` —— **一个根本不存在的服务**，搜索还打 `POST /memories/search`（海马体没这个端点，搜索是 `POST /api/search`），增删改全是**纯本地不同步**，而且 `MemoryPage` **从来没调过 `fetchMemories`** → 记忆页永远是空的。② 三个契约陷阱已按源码核过并写进代码注释：**dimension 请求侧小写**（`handlers.rs:216-222` 传错直接 400 "Invalid dimension"）、**搜索是 POST `/api/search`**、**响应是 snake_case + dimension PascalCase + layer 枚举全名**（`L2Detail` → UI 的 `L2`）。③ 顺带修掉 3 个真问题：**维度过滤语义搞反**（`SearchRequest` 根本没有 dimension，筛选该走 `GET /api/memory?dimension=`）、**新增记忆时的 layer 选择器是假的**（`AddMemoryRequest`/`UpdateMemoryRequest` 都没有 layer 字段 → 服务端恒为 `L2Detail`，客户端选的值没地方存 → 从 UI 移除）、**「搜索到 0 条」会显示全部记忆**（新增 `hasSearched` 区分「搜过没搜到」和「还没搜」）。④ **`tenant_id` = 多灵魂的隔离轴**（用户要的「一个海马体多个灵魂」**零 schema 改动**）：`HippocampusClient.setTenantId()` + store 的 `personaId`（持久化 + `onRehydrateStorage` 同步给 client），家庭场景 = 每人一个 tenant id。⑤ 清理 `prefrontalClient.ts` 里无调用方且端点不存在的 `listMemories`。**关键发现**：海马体的巩固器**已经把洞见写成 `dimension=Agent` 的记忆**（`observer.rs:21-38` 的 `Insight::as_memory` → `consolidate.rs:118-124` 的 `insert_memory`，uri `insight://<uuid>`、metadata 带 title/source_events）—— 用户选的「人格落海马体 dimension=Agent」**不是提案，是已经建好但只写不读的方向**，缺的不是存储是**读**和**注入**。**核心判断**：缺的是一根线 ——「**agent → 客户端的结构化动作**」：端脑 `Intent` 九变体不覆盖外观（`intent.rs:6-38`）、`call_llm` 无 tools 字段（`lobes/mod.rs:321-344`）、`ToolRegistry` 没有 client action 类；而两端客户端**各有半截**（桌面端 `ToolPartRouter`/`ClientToolForm` 有渲染骨架但**全仓无消费方**；移动端 `chat_provider.dart:766-769` 的 `tool_call` **只打日志**）⇒ 只加 UI 或只加 Intent 都无效。设计全文 `docs/superpowers/architecture/2026-10-29-shadow-persona-and-appearance.md`（含批次 A 外观闭环 / B 背景图双模式 / C 人格三步路线）。⚠️ 移动端人格仍无落点（移动端脑**不带海马体** → 必须走零信任网络连远端）。验证：桌面 `tsc --noEmit` **exit 0** + vitest **111 文件 / 1132 passed / 2 skipped**（新增 12 例端点契约测试 `src/lib/__tests__/hippocampusClient.test.ts`），跨端守门员 **0 阻断 / 0 提示**)
**Updated:** 2026-10-29 (⑩ **修「等 WiFi → 黑屏」**（真机反馈的启动期崩溃级 bug）：移动端启动时若本地模型还没下载好且当前是移动网络，会弹「检测到移动网络」对话框；点「等待 WiFi」之后**整个 App 黑屏**。根因在 `chat_screen.dart` 的 `_showDownloadDialog`：`result == 'wifi'` 分支写的是 `navigator.pop()`（`navigator` = `Navigator.of(context)`，即 ChatScreen 所在的那个导航器），而 `/chat` 是路由表的 `initialLocation` —— 根导航器上的**第一个**路由，弹掉之后根导航器里就没有任何路由了 → 屏幕上什么都没有。修法：① 「等 WiFi」**不再导航** —— 它是一个**推迟**动作，不是「离开」；② 改成订阅 `NetworkService().onNetworkTypeChanged`，连上 WiFi 后**自动**开始下载；③ 给用户一条 SnackBar 提示（l10n 新增 `waitingForWifiHint`）；④ `_downloadDialogShown` 保持 true —— 否则 build 里 `modelNotReady` 会立刻把同一个对话框再弹一遍，变成「关掉又弹」的死循环。可测性改造：`NetworkService` 改成 Riverpod provider（`lib/providers/network_provider.dart`）—— 这条分支既要读网络类型又要订阅网络变化，直接 `new` 的话测试既没法注入假网络类型，也没法把「连上 WiFi」这个事件推进去。顺手修 `use_build_context_synchronously`：`_showDownloadDialog` 的 `context` 参数**遮蔽**了 `State.context`，analyzer 认不出 `mounted` 守卫守的是同一个 → 去掉参数、直接用 `State.context`。回归测试 `test/widget/chat_screen_wifi_test.dart`（3 例：弹出了对话框 / 页面没被弹掉 / 连上 WiFi 自动下载）**并做了反向验证** —— 把 `navigator.pop()` 改回去，测试确实红：`Found 0 widgets with type "ChatScreen"`（页面被弹掉 = 黑屏）。验证：移动 `analyze` **0 error**（89 issues 全是存量 info）+ `flutter test` **247/247 全绿** + `dart format` 干净)
**Updated:** 2026-10-29 (⑨ **Android 构建链实测通过**（Flutter 3.47.8 上第一次完整打包验证）：`flutter build apk --debug` **exit 0 / 866s / APK 346.8MB**，工具链 = Gradle 8.14.0 + AGP 8.11.1 + Kotlin 2.2.20 + NDK 30.0.14904198 + CMake 3.22.1 + JDK 17.0.20.1。**ABI 声明核对通过**：`aapt2 dump badging` → `native-code: 'arm64-v8a' 'x86_64'`，**没有 armeabi-v7a** —— 与 `build.gradle.kts` 的 `supportedAbis` 一致（2026-10-29「暂不做 armv7」的决定在产物层闭环）。**`libmnnbridge.so` 两个 ABI 都在包里** —— 之前那个「`externalNativeBuild.cmake.path` 未设 → CMake 源目录被改写成空模板 → `libmnnbridge.so` 从未进过 APK」的打包缺陷已彻底闭环。compileSdk 36 / minSdk 31 / targetSdk 36。**同时查出两个真问题**：① **x86_64 的 jniLibs 不完整** —— APK 的 `lib/x86_64/` 里**没有 `libc++_shared.so`**，而 `llvm-readelf -d` 实测 `libmnnbridge.so`（两个 ABI 都一样）的 DT_NEEDED 明确要它 → x86_64 上 `loadLibrary("mnnbridge")` 必失败；x86_64 也缺 MNN 全家（`libMNN*.so`）与遗留 `libprefrontal_core_lib.so`（后者已被 `PrefrontalRuntime` 的 try/catch 兜住，前者没有）。**目前不会崩**，因为 Kotlin 层的 `PrefrontalMNN` 是**死代码**（全仓无人引用），而 `com.ibloc.shadow/mnn` 这个 MethodChannel 在 `MainActivity` 里**声明了却从未注册 handler** —— 但只要有人重新接上 MNN 本地推理，x86_64 就会踩坑。已给 `PrefrontalMNN.init{}` 补上与 `EncephalonRuntime`/`PrefrontalRuntime` **完全同款**的优雅降级（不重抛 `UnsatisfiedLinkError`），并把理由写进注释。② **CI 发布的 APK 必然缺嵌入式大脑** —— `.so` 不入库（要靠兄弟仓的 build 脚本编出来再拷），而 `release.yml` 的 `mobile-apk` job 直接 `flutter build apk --release --split-per-abi`，**没有拉 `.so` 的步骤** → CI 产物里没有 `libencephalon.so`（`EncephalonRuntime` 会 catch → 优雅降级，但主功能直接缺失）；`libmnnbridge.so` 反而没问题（CMake 从源码编）。**待用户定**：CI 里现编 Rust 交叉编译，还是下载 release artifact？③ **版本弃用告警**（不是错误）：Flutter 3.47.8 提示 Gradle 8.14.0 / AGP 8.11.1 / Kotlin 2.2.20 即将被弃用（要 9.1.0 / 9.0.1 / 2.3.20）；Flutter migrator 自动往 `gradle.properties` 加的 `android.builtInKotlin=false` / `android.newDsl=false` **已入库**（否则换台机器重建行为会不一样）。⚠️ **真机验证仍未做**（设备失联）：设置页空白 A/B、两端玻璃拟态**分别**验证、Impeller A/B 都没跑)
**Updated:** 2026-10-29 (⑧ **移动端组件库落地 + 设置页瘦身（批次 3）**：用户拍板组件库 = **nank1ro 的 Flutter ShadcnUI（`shadcn_ui` 0.57.3）**、范围 = **移动端彻底去 Material**、时机 = 并入批次 3。先升工具链：**Flutter 3.41.4 → 3.47.8**（Dart 3.11.1 → 3.13.7，CI 两处 `flutter-version` + `release.yml` 同步修，pubspec SDK `^3.13.0`）。选型实测：`shadcn_flutter` 0.0.55 解析失败（需 SDK ≥3.13.0）、`forui` 要求 Flutter ≥3.47.0；`shadcn_ui` **整个 lib 零 Material 依赖**（`Material(`/`InkWell` 命中 0），但**缺 Command/Palette、Combobox、Skeleton、Drawer、Toggle、Carousel、Pagination**（批次 4 的 `/` 命令面板需自建）。落地：新增生成物 `lib/theme/shad_scheme.g.dart`（token→shadcn 投影，纳入生成器 + 漂移校验）、`main.dart` 用 `MaterialApp.router` 的 `builder:` 挂 `ShadTheme`（主题色运行时可变，每次重建重投影）。**批次 3 = 设置页瘦身**（审计 F6）：18 个平铺 `ListTile` → **4 组（外观 / 语音与辅助 / 运行时 / 连接）+ 高级折叠（默认收起）+ 危险操作隔离**；TTS 从 4 个平铺 tile 收成 1 组 2 项；「重置引擎」**必须二次确认**（原来一点就执行）。新增原语 `lib/widgets/settings/settings_row.dart`（`SettingsRow` / `SettingsGroup` / `SettingsBlock` / `SettingsDisclosure`）—— **可点行手写、不用 `ShadButton`**（它内部 `Row` 是 `MainAxisSize.min`，会传无界主轴约束，行内放 `Expanded` 必炸 "non-zero flex but incoming width constraints are unbounded"），但配色 / hover / focus 反馈全取 shadcn 主题 —— 统一的是语言不是像素；`SettingsDisclosure` **折叠时不构建子树**（`AnimatedCrossFade` 会保留子树 → 日志面板会在用户没展开「高级」时就去连日志流）。`log_panel_section.dart` 一并去 Material（`SegmentedButton`/`PopupMenuButton`/`Switch`/`IconButton`/`SnackBar` → `ShadSelect`×2 / `ShadSwitch` / `ShadIconButton`×2 / 局部 `ShadSonner`）。**修掉 3 个真问题**：① 高级折叠区文案重复（disclosure 标题与内部卡标题是同一个字符串 → 同一字符串在树上出现两次，「折叠后不可见」这类断言直接失效）—— 折叠标题改用新 key `settingsAdvancedLegacy`「遗留运行时」，内部卡删掉重复标题；② 设置页里 `pumpAndSettle` **必然超时**（内存是异步读的，加载态用不定进度条 → 永远在动）—— 测试里 override `systemMemoryProvider`；③ 日志面板残留的 Material `Switch` 被嵌进了设置页。**新契约：shadcn 组件页面必须有 `ShadTheme` 祖先**（生产 `main.dart` 已挂；测试用 `withShadTheme(...)` 装配同一套 `ShadScheme.of(...)`）。l10n +23 key（两端 ARB 平铺 camelCase，Flutter ARB 不支持带点 key）。验证：移动 `analyze` **0 error** + `flutter test` **249/249 全绿**（其中设置页 17 个结构契约用例），`dart format` 干净，生成物漂移校验 0 过期，跨端守门员 **0 阻断 / 0 提示**)
**Updated:** 2026-10-29 (⑦ **对话为主的两端 IA 重构（批次 1+2）**：用户拍板「以对话为主」后落地 —— ① 桌面端默认落地页从任务看板改成对话（`App.tsx` index → `<Navigate to="/conversation" replace />`，用重定向保证侧栏高亮）；② 桌面端侧栏 12 项平铺 → 分段（常驻「对话/任务/群组」3 行 + 「能力」「更多」两块可折叠默认收起 + 设置固定底部）；③ 移动端底 tab **6 → 4**（对话/任务/能力/我），**直播/客服降级为对话形态** —— 它们本来就是同一个 agent 的表达方式，不是并列目的地；④ 两端对话页新增**形态切换器**（桌面 `ConversationModeSwitcher.tsx` / 移动 `conversation_mode_switcher.dart`）。导航结构不再两端各硬编码一份：仓根 `agent-surface.json` 新增 `navigation` 段（桌面 4 段 + 移动 4 tab + `conversationModes`），`scripts/lib/nav.mjs` + `scripts/gen_nav.mjs` 生成两端 `nav.g.ts` / `nav.g.dart`（含 lucide/Material 图标映射 + 规范 labelKey → 移动端平铺 ARB getter 的**生成 switch**）。用户裁定**承认端侧专属**：两端能力不对等，只保证同名同语义（清单里用 `_endSideExclusive` 标注理由）。顺手修一个真 bug：桌面端任务角标之前判断 `/tasks/inbox` 而实际路由是 `/tasks`，角标**一直没显示**。守门员升级：修掉规则 5 的**假阳性**（移动端 ARB 是平铺 camelCase、带点 key 解析会抛 `FormatException`，原来拿同一个子串找两端 → 22 条提示全是假的）、接入**导航生成物漂移校验**、CI 新增 `Navigation drift check`；并做了**反向验证**（抽掉两端各一个 key 确认真会报警）。验证：桌面 `tsc` exit 0 + vitest **1118 passed / 2 skipped**（110 文件），移动 `analyze` 0 error + `flutter test` **228/228**，守门员 **0 阻断 / 0 提示**。评估全文 `docs/superpowers/architecture/2026-10-29-conversation-first-ia-audit.md`)
**Updated:** 2026-10-29 (⑥ **跨端视觉语言落地（阶段 1）**：按用户产品定位「Shadow = 每个人的影子 / 个人助理」重新推导视觉 —— **影子本身没有颜色**（它是光的缺失），所以基底改为**中性黑白灰**（shadcn 的 zinc 语义色板），**品牌色从「内置霓虹紫青」改成「用户可覆盖的槽位」**（默认中性 `#71717A`，7 个预设）。三层语言 = **Umbra 本影（实心）/ Penumbra 半影（玻璃）/ Caustic 焦散（实时信号）**；**发光从装饰降级为信号**（只用于 agent 在线/思考/拾音，颜色取状态色）。落地：`design-tokens.json` 重写 + `scripts/gen_tokens.mjs`（生成桌面端 `tokens.css`/`accent.g.ts` 与移动端 `app_tokens.g.dart`，生成器核心 `deriveAccentTones` **只写一次**）→ 桌面端 `index.css` 改为引用 token + `.glass` 半影层 + `.shadow-ambient` 光源层 + `Card` 默认走玻璃；移动端去霓虹改中性阶、`glass_theme.dart` 改为 `GlassTheme.build(appearance, brightness)`、`AppColors` 主题色改为可变全局（63 处引用跟着主题走）。**两端都要玻璃拟态**（用户拍板）；⚠️ 桌面端是 Chromium WebView、移动端是 Android 原生 Flutter，**`BackdropFilter` 行为不等价，必须分别验证**。新增**用户自定义**：主题色 / 玻璃强度 / 对话框背景（桌面端 `themeStore.ts` 写 `<html>` 内联 CSS 变量，移动端 `theme_provider.dart` 落 `app_config.json`）。新增**跨端契约快照** `scripts/accent-tones.fixture.json` + 两端各自断言（两端算法不可能悄悄分叉）。顺手修一个真 bug：桌面端 `bg-primary/10` 之前**不透明度修饰符根本没生效**（Tailwind 缺 `<alpha-value>`），现在才真是 10%。守门员升级为拦截「生成物漂移 / 两端手写色值 / 玻璃语义不对等」。验证：桌面 `tsc` exit 0 + vitest **1111/1111**，移动 `analyze` 0 error + `flutter test` **228/228**，守门员 **0 阻断**。推导全文 `docs/superpowers/architecture/2026-10-29-shadow-visual-language.md`)
**Updated:** 2026-10-29 (⑤ **立跨端设计契约**：桌面端与移动端是同一个 agent 的两个终端，按此把 UI 整改重排为「先立共享源、再改两端投影、最后清代码」。仓根新增两份唯一真相源 —— `design-tokens.json`（设计数值）与 `agent-surface.json`（能力 → 两端入口映射，30 条能力），配 `scripts/check-agent-surface.mjs` 守门员并接进 CI（`Cross-client consistency check`），当前两端 26 + 29 条路由**全部登记在册、0 阻断**。配套文档 `docs/superpowers/architecture/2026-10-29-cross-platform-design-system.md`。**统一 ≠ 长得一样**：统一的是色彩/节奏/命名/能力语义，分叉的是容器形态/密度/端侧特有功能)
**Updated:** 2026-10-29 (① **移动端暂不做 armv7**（用户决定）：只发 `arm64-v8a` + `x86_64`，所以「把 wasmtime 拆可选以支持 armv7」的必要性消失 —— wasmtime 拆可选现在只剩**减体积**的价值（`.so` 150.6MB / APK 346.8MB，根因是端脑面带入的 DataFusion/Arrow/Parquet 栈 ≈47.8MB）。文档里「armeabi-v7a 为什么编不出来」的结论从「阻断点待转移」改成「明确不做」，cranelift/wasmtime 那段留作背景。② **修端脑会话的 wire 契约**：端脑 `ConversationTurn` 序列化成 `{role, text, at}`（`at` = RFC3339），**不是 `timestamp`**；移动端 Dart 照着前额叶方言读 `timestamp` → `(null as num).toInt()` → `_TypeError`，会话列表页与 session transfer 导入响应只要有历史就崩。已改成两种形状都认 + 4 条回归测试（fixture 用 Rust 侧实测字节）；桌面端 `Conversation.history` 类型声明同步改成 `at: string`。③ CI 红灯收敛为**只差 `IBLOC_TOKEN`**（三仓 workflow 的兄弟仓 checkout 都已就位，守卫步骤提前 exit 1 并打印该配什么）；shadow 仓我改的部分全绿（Mobile Analyze / Mobile Test / Desktop Tests / Desktop Build），仍红的只有 `Prefrontal Rust` 与 `Desktop E2E` 两个需要 secret 的 job。④ 真机（小米 2106118C / Android 13）已装 APK 并启动成功无崩溃，但**设置页正文全白未结案** —— 已排除代码 bug 与 build 异常，嫌疑 `BackdropFilter`/Impeller，拿到 `--ez enable-impeller false` 的**零重建** A/B 方案)
**Updated:** 2026-10-28 (移动端 agent 面切到嵌入式大脑 —— **两套「方言」问题查清并修掉**：移动端原有**两个** HTTP client，说的是**两种方言**：`PrefrontalClient` 说前额叶方言（`/api/sessions`、`/api/agents`、`/api/skills`、`/api/providers`、`/api/soul/*`、`/api/mcp/servers`、`/hippocampus/api/*`），`TelencephalonClient` 说端脑方言（`/shadow/v1/*`、`/api/telencephalon/*`、`/.well-known/agent.json`、`/api/flows`）。嵌入式大脑挂起来的那条面 = 端脑的 `cortex_router` → **只有端脑方言**。⇒ 把 `PrefrontalClient` 指过去只会把「连接被拒」换成「404」，本轮**不指**它；把**对话**与**会话列表**从前额叶方言迁到端脑方言（`chat_provider` 改走 `createConversation` + `streamMessage`，`conversation_screen` 改走 `listConversations`，与桌面端 `ConversationPage.tsx` 同一条链路）；Rust 侧 `start_agent_surface()` 在嵌入运行时里挂 `cortex_router`（127.0.0.1:0 随机端口），JNI 加 `nativeGetAgentPort` + `nativeStart(port, dataDir)`（Android 没有 `$HOME`、CWD 是 `/`，端脑的 flow 存储要显式给 App 私有目录），Dart 侧 `EncephalonMobileNotifier` 把端脑 client 的 baseUrl 改成 `http://127.0.0.1:<agentPort>`；**移动端不编本地海马体**（记忆走零信任网络内其它设备），⇒ `telencephalon` 把 `hippocampus-server` 改 optional，**Lance 退出移动端依赖图**；端脑**没有会话删除端点**（桌面端同样没有），移动端会话页的删除按钮移除)
**Updated:** 2026-10-28 (移动端「改嵌大脑」落地：Rust 侧 `encephalon` 加 cdylib + JNI 壳 + `mobile` feature，产出 `libencephalon.so` 由 Kotlin 经 MethodChannel 加载，跑的是与桌面端同款的嵌入式大脑（thalamus + ACP 总线 + 端脑 + 单一 neuron），不再是前额叶 lobe；验证手段：无模拟器时的**宿主 JVM 直测 14/14 全绿** + 交叉编译 `.so` + APK 打包验收；shadow 侧新增 `/settings/encephalon` 运行时管理页与 5 项 widget 测试（`bafac3f`）；三个 PR 必须按 diencephalon → telencephalon → encephalon 顺序合并；CI 全红是缺 `IBLOC_TOKEN` secret 的**既有基线问题**，与本轮改动无关)
**Updated:** 2026-10-28 (移动端 l10n 全量收口：220+ 处硬编码中文接入 `AppLocalizations`，arb 179→441 key；测试断言改走 `l10nOf(tester)` 不再写死中英文；修 `arb` 里 `openVoiceMode` 重复键（JSON 后者覆盖前者）；`currentL10n()` 改用 `PlatformDispatcher.instance`（`WidgetsBinding.instance` 要求 binding 已初始化，纯 Dart 单测与后台 isolate 会抛）；孤儿页处理 —— 嵌入式 Prefrontal 页接进路由 `/settings/prefrontal`，外部进程架构三件套（死代码）删除；`prefrontal` 仓新增**宿主 JVM 直测 JNI**（模拟器不可用时的替代验证，12 项断言全绿），顺带修一个真 bug：provider 与 agent 用的不是同一份 `LlmConfig`，导致嵌入式运行时永远指向 `api.openai.com` 且无 key)
**Updated:** 2026-10-28 (移动端测试从 173/28 修到 **201/201 全绿**并接入 CI：修 3 处真实代码 bug —— `AgentsResponse` 的 legacy `cortex` 键 fallback 写成了重复的 `telencephalon`、`AppConfigService` 解析失败只重置了一个字段且 `init()` 被 `_isInitialized` 短路导致永不重载、`TelencephalonClient.listConversations` 把 JSON 数组强转 Map；另修 20 处文案断言（屏幕硬编码中文）、3 处缺 localization delegate、2 处 `pumpAndSettle` 撞无限动画超时；CI 新增 `Mobile Test` 作业。同日修复移动端打包缺陷：`externalNativeBuild.cmake.path` 未设导致 Flutter 插件把 CMake 源目录改写成空模板，`libmnnbridge.so` 从未进过 APK)
**Project:** shadow (影) - AI 用户分身系统
**Spec version:** 2026-10-29 通信链路规范 —— 大脑 → 端脑 → 叶区（**以代码为准**）。旧的「4 层架构」分层法已弃用：Prefrontal 降为端脑内的 native lobe，客户端不再直连推理。
**现行文档**: [`README.md`](README.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`docs/superpowers/architecture/`](docs/superpowers/architecture/)
**Parent project summary**: `/home/ibloc/Projects/AGENTS.md` (not git-tracked — drift-prone; **not present on this Windows checkout**, paths stay verbatim Linux for now). Sibling audit: [`2026-09-23-iBLOC-progress-assessment.md`](docs/superpowers/architecture/2026-09-23-iBLOC-progress-assessment.md). Companion E2E coverage assessment: [`2026-09-25-e2e-coverage-assessment.md`](docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md).
**Telencephalon (Layer 3.5) subsystem surface**: see [`telencephalon/AGENTS.md` §Subsystem Management (3-tier auth)](../telencephalon/AGENTS.md) — the active repo after the 2026-09 rename chain. The original `cortex/` directory at `C:\Projects\iBLOC\cortex\` is empty (placeholder).

## OVERVIEW

**Shadow (影)** 是用户的个人助理（AI 影子），运行在用户自己的设备上（桌面或移动端），替用户执行日常任务和工作。桌面端与移动端是**同一个 agent 的两个终端** —— 共享同一套大脑、同一套端脑、同一份设计语言。

最关键的一条：**所有通信都走 大脑 → 端脑 → 叶区**。客户端不直接调推理。

### 核心特性

- **统一链路** —— 两端都走 大脑 → 端脑 → 叶区；意图路由、工具调用（`tool_call`）、工作流、人格注入都在链路上
- **进程内大脑** —— 桌面端 `encephalon::Embedded::boot()`，移动端 `libencephalon.so`；推理实例只有一个（neuron）
- **长时记忆** —— 海马体挂在端脑面的 `/hippocampus/api/*`；人设与主题色可以写成 `dimension=Agent` 的记忆
- **外观可定制** —— 主题色 / 玻璃强度 / 对话框背景都是运行时变量；品牌色是**用户可覆盖的槽位**，影子本身保持中性
- **对话为主** —— 对话是两端唯一主干与默认落地页；语音 / 直播 / 客服是对话的**形态**，不是并列 tab
- **跨端契约可执行** —— 链路 / 能力清单 / 设计 token / 导航 / 品牌，5 个守门员进 CI
- **本地与云端模型** —— 本地模型走 neuron（candle / burn / litert 等后端）；云端供应商走独立的 OpenAI 兼容客户端（**不是**对话链路）

## 系统架构

> **规范版本**：2026-10-29（以代码为准）。
> 旧的「4 层 + 中心化编排服务」分层图已弃用 —— Prefrontal 早已降为**端脑内的 native lobe**，客户端也不再直连推理。

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  客户端（两端同形）                                                          │
│                                                                             │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐          │
│  │   Shadow-Desktop            │    │   Shadow-Mobile             │          │
│  │   shadow/shadow-desktop/    │    │   shadow/shadow-mobile/     │          │
│  │                             │    │                             │          │
│  │   Tauri 2 + React 19        │    │   Flutter 3.47.8            │          │
│  │   • Zustand 5               │    │   • Riverpod 2.5            │          │
│  │   • React Router 7          │    │   • GoRouter 14             │          │
│  │   • shadcn/ui (Radix + CVA) │    │   • shadcn_ui (ShadcnUI)    │          │
│  │   • 桌面自动化 (RPA)        │    │   • Android 无障碍 API      │          │
│  └──────────────┬──────────────┘    └──────────────┬──────────────┘          │
│                 │                                │                           │
│                 │      端脑方言 /shadow/v1/*      │                           │
└─────────────────┼────────────────────────────────┼─────────────────────────┘
                  ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  大脑 Encephalon  https://github.com/iBLOC/encephalon                          │
│  顶层 agent crate: diencephalon(间脑) + telencephalon(端脑) + 单一 neuron    │
│  • Embedded::boot() —— 进程内嵌入                                             │
│    桌面端 = Tauri sidecar（进程内）；移动端 = libencephalon.so（App 进程内）    │
│  • 一棵 ACP 总线 + 一棵 axum HTTP 树                                          │
└─────────────────┬───────────────────────────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  端脑 Telencephalon  https://github.com/iBLOC/telencephalon   Port 60080     │
│  (was cortex → encephalon → telencephalon, 2026-09 rename chain)             │
│  Rust (axum 0.8 + synapse::wasm)                                             │
│  • agent 运行时：会话 / agent registry / A2A gateway / WASM host / MCP 管理    │
│  • 意图路由 + 工具调用 + 工作流 + 人格注入 —— 都在这一层                        │
│  • LobeKind: Native / Wasm / Prompt / External                                │
│  • MCP 管理: wasm-only transport, 10-route HTTP                               │
│  • 客户端唯一对话对象：/shadow/v1/*  +  /api/telencephalon/*                 │
│                                                                              │
│  └── 叶区（native lobe，进程内）                                              │
│        • temporal    对话 / 意图                                              │
│        • prefrontal 任务                                                      │
│        • parietal    编排                                                      │
└─────────────────┬───────────────────────────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  推理 neuron  github.com/ibloc/neuron   Port 8083 (8085 embedded)           │
│  Rust 单二进制推理运行时 (LLM/TTS/ASR/Rerank)                                │
│  • candle (默认) / voxcpm (burn) / litert 三个 ML 后端                       │
│  • OpenAI 兼容 HTTP 端点（/v1/chat/completions 等）                           │
│  • **进程内唯一实例** —— 叶区调它，客户端不调它                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  存储（横切）                                                                │
│  • Hippocampus  https://github.com/iBLOC/hippocampus  Port 8081              │
│    5-crate Rust workspace — HybridRAG + temporal + consciousness             │
│    桌面端：进程内，挂在端脑面的 /hippocampus/api/*（**只有一份**）             │
│    移动端：脑内不带，按设计走零信任网络上的远端海马体                          │
│  • 模型权重: ~/.neuron/models/{engine}/{id}/                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  设备协同（横切，两端各自实现）                                               │
│  • 桌面端：mDNS 设备发现 + 配对码握手 + 对端 agent 服务实例                   │
│             （stores/serviceStore.ts / stores/certificateStore.ts /           │
│               pages/ResonancePage.tsx / lib/discoveryClient.ts）              │
│  • 移动端：BLE 配网（flutter_blue_plus）+ mDNS 发现 + USB 音频路由            │
│  • 出网通道：端脑的 encrypted mDNS 广播 + mTLS 信任存储 + A2A gateway；        │
│    桌面端 sidecar 另有 mTLS WebSocket 客户端（src-tauri/src/ws_client.rs）     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Shadow 在链路中的位置

| 维度 | 位置 |
|---|---|
| 主要职责 | 客户端（Interaction）—— 用户交互 UI + 设备能力 |
| 进程内职责 | 桌面端 sidecar 内嵌大脑 + 端脑 + 叶区 + 单一 neuron；移动端 App 进程内嵌 `libencephalon.so` |
| 唯一对话对象 | 端脑（`/shadow/v1/*`）—— **不是** neuron |
| 出网 | mTLS / A2A / mDNS / BLE —— 设备协同与模型来源 |
| 独立服务 | 不再对外提供独立编排服务；客户端只做端脑的终端 |

### 端口

| 端口 | 谁在听 | 说明 |
|---|---|---|
| 60080 | 端脑 HTTP 面 | 桌面端固定；移动端嵌入式时随机分配 |
| 8085 | neuron | 桌面端嵌入时固定 |
| 8083 | neuron | 独立运行时的默认端口 |
| 8081 | 海马体 | 独立进程时的默认端口（桌面端在进程内，不占这个端口） |

### 通信链路的可执行保证

`scripts/check-brain-chain.mjs`（CI job `Brain chain check`）把下面 6 条写成检查：

1. 桌面端客户端不得直连推理（`neuron_infer` / `/v1/chat/completions`）
2. 桌面端客户端不得有绕过端脑会话 API 的平台分支
3. 桌面端 sidecar 必须挂起端脑的 HTTP 面
4. 桌面端 sidecar 不得再暴露直连推理的 Tauri 命令
5. 移动端对话必须走端脑方言（`/shadow/v1/conversations`）
6. 移动端不得保留本地直连推理的对话编排器

详见 `docs/superpowers/architecture/2026-10-29-brain-chain.md`。

### 三种运行形态，同一条链路

| 形态 | 端脑面对外端口 | 叶区 → LLM 指向 | 修在哪 |
|---|---|---|---|
| 桌面端 sidecar（进程内嵌） | `127.0.0.1:60080` | `native_lobes.reconfigure` → `:8085`（neuron 自己的 listener） | shadow 仓 `src-tauri/src/cortex_http.rs` |
| 移动端 App（`libencephalon.so`） | 随机端口 | `point_lobes_at_neuron` → 进程内 neuron | 大脑仓 `point_lobes_at_neuron`（**已合并**） |
| 独立大脑（`encephalon-server`） | `:8082` | 同上 | 同上 |

**为什么必须指向 neuron 自己的 listener**：`neuron::create_router` 每次调用都**重建** `ServerState` —— 合并进端脑 HTTP 面的那张 neuron 路由不是活着的那个实例。更要紧的是叶区的默认端点 `http://localhost:60080` 在移动端与独立大脑上**没有任何东西在听**（端脑面分别是随机端口和 `:8082`），于是叶区发起的 LLM 调用 connection refused，而对话照样有回音 —— 能力静默失效。

三处现在用同一套逻辑：桌面端 sidecar 自己的 `native_lobes.reconfigure` 循环，移动端与独立大脑走大脑仓的公共函数 `point_lobes_at_neuron`（附两条不变量测试）。shadow 的守门员只扫客户端侧，服务端侧的断点由兄弟仓的测试守住。

## 项目结构

```
shadow/
├── AGENTS.md                    # 唯一知识库（本文）
├── README.md                    # 落地页
├── ARCHITECTURE.md              # 平台架构（链路 / 组件 / 端口 / 协议）
├── design-tokens.json           # 设计数值唯一真相源 → 两端投影
├── agent-surface.json           # 能力清单 + 导航结构唯一真相源 → 两端投影
├── brand/                       # 品牌几何真相源（geom.mjs）+ logo / 图标生成器
├── scripts/                     # 跨端守门员 + 生成器
│   ├── check-brain-chain.mjs    # 通信链路 6 条规则
│   ├── check-agent-surface.mjs  # 能力清单 ↔ 两端路由 / 生成物漂移
│   ├── gen_tokens.mjs           # design-tokens.json → 两端 token
│   └── gen_nav.mjs              # agent-surface.json → 两端导航
├── docs/superpowers/
│   ├── architecture/            # 现行架构文档（2026-09 / 2026-10-29 系列）
│   ├── specs/  plans/  scenarios/   # 历史设计记录（按日期存档，描述当时的决策）
├── shadow-desktop/              # 桌面端 (Tauri 2 + React 19)
│   ├── src/                     # React 19 前端
│   │   ├── pages/               # 25 个页面
│   │   ├── components/          # 共享组件（ui = shadcn 原语）
│   │   ├── stores/              # Zustand store
│   │   ├── lib/                 # 端脑 / 海马体 / 云端供应商客户端
│   │   └── i18n/                # 国际化 (en-US / zh-CN)
│   └── src-tauri/               # Rust sidecar
│       └── src/cortex_http.rs   # 端脑 HTTP 面（:60080）
├── shadow-mobile/               # 移动端 (Flutter 3.47.8 + shadcn_ui)
│   ├── lib/                     # Flutter UI (Dart)
│   │   ├── screens/             # 24 个页面
│   │   ├── providers/           # Riverpod 状态
│   │   ├── services/            # 服务层（telencephalon / encephalon / database …）
│   │   └── agents/              # agent provider（工具注册表、人设）
│   └── android/app/src/main/
│       ├── kotlin/com/ibloc/shadow/   # EncephalonRuntime（JNI 桥）等
│       ├── cpp/                 # C++ JNI 桥接（MNN bridge）
│       └── jniLibs/<abi>/       # libencephalon.so 等（不入库）
├── shadow-esp32/                # 边缘 ESP32-S3 客户端 (Zephyr + C, v0.x 概念阶段)
│   ├── main/                    # 当前是 ESP-IDF esp_hid_device scaffold (过渡)
│   ├── docs/                    # RESEARCH.md + adr/0001-stack-choice-zephyr-c.md
│   ├── build/                   # ESP-IDF v6.0.2 编译产物(已验证工具链 OK)
│   └── README.md
└── benchmark/                   # 性能基准 + 三方对照报告
```

> **Note**: `docs/superpowers/{specs,plans,scenarios}/` 是**历史设计记录**（2026-03 ～ 2026-09，44 份），记录的是**当时**的决策，不是现状。现行架构文档在 `docs/superpowers/architecture/`（尤其 2026-10-29 系列）。两端各有自己的 `AGENTS.md`（`shadow-desktop/AGENTS.md` / `shadow-mobile/AGENTS.md`）。

## 跨端设计契约（2026-10-29 起）

> **原则**：桌面端与移动端是**同一个 agent 的两个终端**。同一个 agent 能力不应该在两端有两个名字、
> 两套入口语义、两种视觉。端侧特有功能（电脑操作 / 直播 / 客服 / 配网）是**同一能力的端侧封装**，
> 不是另一个产品。
>
> 方案全文：[`docs/superpowers/architecture/2026-10-29-cross-platform-design-system.md`](docs/superpowers/architecture/2026-10-29-cross-platform-design-system.md)

**两端同仓**（`shadow/shadow-desktop` + `shadow/shadow-mobile`）是能真正共享的前提。仓根两份契约：

| 文件 | 内容 | 消费方 |
|---|---|---|
| `design-tokens.json` | **设计数值的唯一真相源**：颜色 / 间距 / 圆角 / 字号 / 字重 / 时长 / 断点 | 由 `scripts/gen_tokens.mjs` 生成两端落地文件（桌面端 `src/styles/tokens.css` + `accent.g.ts`；移动端 `lib/theme/app_tokens.g.dart`） |
| `agent-surface.json` | **能力 → 两端入口的唯一映射表**：`id` / `group` / `labelKey` / `icon` / `desktop.route` / `mobile.route`，外加 **`navigation` 段**（桌面分段 / 移动 tab / 对话形态） | 两端导航从它生成（`scripts/gen_nav.mjs` → 桌面 `src/navigation/nav.g.ts` + 移动 `lib/navigation/nav.g.dart`），而不是各自硬编码一份页面清单 |
| `scripts/accent-tones.fixture.json` | **主题色派生的跨端契约快照**（冻结的期望值） | 桌面端 `tests/styles/accentTones.test.ts` + 移动端 `test/theme/accent_tones_test.dart` 各自断言 |

**统一什么 / 分叉什么**：设计数值、能力清单、能力状态、信息架构骨架、文案 key 语义、交互流程模式
→ **共享**；容器形态（侧边栏 vs 底 tab）、信息密度、端侧特有能力、组件实现（React vs Flutter）→ **分叉**。
**统一 ≠ 两端长得一样**：统一的是语言（色彩语义 / 节奏 / 命名 / 能力语义），不是像素。

**守门员**：`scripts/check-agent-surface.mjs`，CI 的 `Cross-client consistency check` 步骤（desktop-build job）。
它拦住：清单里的路由在两端不存在 / 两端偷偷多出或少出路由 / **生成物与 token 源漂移** /
**导航生成物漂移** / 移动端或桌面端偷偷手写色值 / 两端玻璃语义不对等 / 两端文案 key 体系分叉。
当前状态：**两端 26 + 29 条路由全部登记在册，5 个生成物 0 过期，0 阻断 / 0 提示**。

**生成物是从属的**：不要手改 `tokens.css` / `accent.g.ts` / `app_tokens.g.dart` /
`nav.g.ts` / `nav.g.dart` —— 改 `design-tokens.json` 后跑 `node scripts/gen_tokens.mjs`，
改 `agent-surface.json` 的 `navigation` 段后跑 `node scripts/gen_nav.mjs`。
生成器核心（`deriveAccentTones` 等）在 `scripts/lib/tokens.mjs`、导航解析与
`toArbKey` / `collectLabelKeys` 在 `scripts/lib/nav.mjs` 里**各只写一次**，
生成与校验共用同一份实现，所以两端不可能算法分叉。

**尚未推进**（阶段 1.5/2）：移动端 212 处 `EdgeInsets` / 117 处硬编码 `fontSize` 尚未 token 化；
桌面端 351 处原始色阶 class / 119 处硬编码 hex 尚未 token 化；
两端老 `nav.*` 文案 key 已被 `surface.*` 取代但尚未清理。

## 跨端视觉语言（2026-10-29 起）

> **原则**：Shadow = **每个人的影子 / 个人助理**。影子本身没有颜色 —— 它是光的缺失。
> 所以基底是**中性黑白灰**，**主题色是用户可覆盖的槽位**而不是产品强加的品牌色。
>
> 推导全文：[`docs/superpowers/architecture/2026-10-29-shadow-visual-language.md`](docs/superpowers/architecture/2026-10-29-shadow-visual-language.md)

**三层语言**：

| 层 | 语义 | 桌面端 | 移动端 |
|---|---|---|---|
| **Umbra**（本影） | 实心层：页面底 / 输入框 / 用户的确定数据 | `--background` / `--card` | `surfaceDark/LightBase` 等 |
| **Penumbra**（半影） | 半透明层：卡片 / 对话框 / 底栏 / 侧边栏 | `.glass`（`src/index.css`） | `GlassCard` |
| **Caustic**（焦散） | 实时信号：agent 在线 / 正在思考 / 正在拾音 | 状态色（暂未加辉光） | `GlassCard(glow: true)`，默认关 |

**四条硬规则**（违反即视为破坏设计语言）：

1. **基底无彩** —— 任何硬编码颜色都必须来自 `design-tokens.json`。
2. **主色是反色** —— 暗色模式上是光（近白），亮色模式上是影（近黑）；用户换色后由同一算法派生两端色调。
3. **玻璃 = 半影层** —— 两端都要有：模糊 + 半透明白 + 1px 边；**桌面端是 Chromium WebView，移动端是 Android 原生 Flutter，`BackdropFilter` 行为不等价，必须分别验证**。
4. **发光是信号不是装饰** —— 只用于实时状态，颜色来自状态色。

**用户可定制**（两端对称）：主题色 / 玻璃强度 / 对话框背景。
桌面端 `stores/themeStore.ts`（写 `<html>` 内联 CSS 变量 + localStorage）；
移动端 `providers/theme_provider.dart` + `theme/theme_appearance.dart`（`app_config.json`）。

**已知风险**：移动端 `AppColors.primary` 为跟随主题变成了**可变全局**（63 处引用不用逐个改），
代价是不能进 `const` 上下文；长期应改读 `Theme.of(context).colorScheme.primary`（阶段 1.5）。

## 对话为主的两端 IA（2026-10-29 起）

> **原则**：用户是**以对话为主**的。对话是唯一主干，也是两端的默认落地页；
> 能力是对话可调用的工具，不是并列目的地；表达形态（语音 / 直播 / 客服）是对话的**模式**，
> 不是并列 tab。
>
> 评估全文（含 7 条带代码证据的发现 F1–F7）：
> [`docs/superpowers/architecture/2026-10-29-conversation-first-ia-audit.md`](docs/superpowers/architecture/2026-10-29-conversation-first-ia-audit.md)

**已落地（批次 1+2）**：

| 落法 | 桌面端 | 移动端 |
|---|---|---|
| 对话是默认落地页 | `App.tsx` index → `<Navigate to="/conversation" replace />` | 本来就是（`/` → `ChatScreen`） |
| 导航收成一块 | 侧栏 12 平铺 → 常驻 3 行 + 「能力」「更多」两块可折叠 | 底 tab 6 → **4**（对话/任务/能力/我） |
| 表达形态降级 | 对话页形态切换器（对话 / 语音） | 对话页形态切换条（对话 / 语音 / 直播 / 客服） |
| 导航结构单一源 | `src/navigation/nav.g.ts`（生成） | `lib/navigation/nav.g.dart`（生成） |

**端侧专属是允许的**：用户裁定「承认端侧专属，只保证同名同语义」——
电脑操作 / 编排 / 规则编辑器 / 追踪 = 桌面端专属；直播 / 客服 / 配网 / 设备发现 = 移动与设备端专属。
清单里用 `_endSideExclusive` 标注每个专属能力及理由；生成器按各端 route 解析，
**某一端没有路由就自动跳过**该端导航项。

**规范 labelKey 只有一份**（写在清单里，如 `surface.chat`），但两端**存储形式必须不同**：
桌面端 i18next 用嵌套 JSON（`t('surface.chat')` 原生可用）；
移动端 Flutter ARB 是**平铺**的 —— 带点的 key 解析会抛 `FormatException` ——
所以存成 camelCase（`surfaceChat`），由生成的 `navLabel()` switch 做 id → getter 映射。
**这个映射由脚本生成，不手改**（`scripts/lib/nav.mjs` 的 `toArbKey`）。

**下一批（未做）**：批次 3 设置瘦身（桌面 9 section → 3 组；移动 18 平铺 tile → 4 组 + 高级折叠）、
批次 4 能力回到对话界面（治 F4 根因：两端对话界面目前调不起任何能力）、
批次 5 能力对齐、批次 6 `setup` 首次引导接线。

## 双端差异

### Shadow-Mobile (移动端)

| 特性 | 实现 |
|------|------|
| **框架** | Flutter 3.47.8 |
| **状态管理** | Riverpod 2.5 |
| **路由** | GoRouter 14 |
| **UI 组件** | shadcn_ui（Flutter ShadcnUI 0.57.3） |
| **大脑** | `libencephalon.so` 进程内嵌（大脑 + 端脑 + 叶区 + 单一 neuron），端脑面随机端口 |
| **本地推理** | MNN / LiteRT 引擎封装仍在，但**不在对话链路上**；对话只走端脑 |
| **Agent2UI** | flutter_genui + genui_a2ui |
| **自动化** | Android Accessibility API |
| **模型来源** | 本地模型 / 魔搭社区 / 云端供应商 |

### Shadow-Desktop (桌面端)

| 特性 | 实现 |
|------|------|
| **框架** | Tauri v2 (Rust + React 19) |
| **状态管理** | Zustand 5 |
| **路由** | React Router 7 |
| **UI 组件** | shadcn/ui (Radix + CVA) + Tailwind 3.4 |
| **大脑** | Rust sidecar 进程内嵌（`encephalon::Embedded::boot()`），端脑 HTTP 面 `127.0.0.1:60080` |
| **本地推理** | neuron (embedded at :8085) — candle / burn / litert backends |
| **Agent2UI** | React 19 components + Tauri OS bridge (CopilotKit 一度是候选, 实际未采用) |
| **自动化** | Tauri commands (window / tray / notifications / fs) + `computer_use.rs` RPA |
| **模型来源** | 本地 neuron (candle 默认) / 魔搭社区 (默认 NEURON_DEFAULT_SOURCE) / 云端供应商 |

## 模块说明

| 模块 | 位置 | 端口 | 功能 |
|------|------|------|------|
| **Telencephalon** (端脑, 2026-09 由 Cortex 改名) | `https://github.com/iBLOC/telencephalon` | 60080 | agent 运行时：会话 / agent registry + A2A gateway + WASM 宿主 + 外部智能体扫描同步 + MCP 管理 (v0.5 Sprint 2) + 意图路由 + 工具调用 + 工作流 + 人格注入 |
| **Encephalon** (大脑) | `https://github.com/iBLOC/encephalon` | 进程内 | 顶层 agent crate: diencephalon(间脑) + telencephalon(端脑) + 单一 neuron 捆在一个 ACP 总线里; 桌面端 `Embedded::boot()` / 移动端 `libencephalon.so` 进程内嵌入, 旧的 cortex sidecar 模式已废弃 |
| **Neuron** (推理) | `https://github.com/iBLOC/neuron` | 8083 / 8085 (嵌入) | 单二进制推理运行时 (LLM/TTS/ASR/Rerank) — candle / burn / litert 后端; **进程内唯一实例** |
| **Prefrontal** (叶区之一) | `https://github.com/iBLOC/prefrontal` | 无独立端口 | 多智能体执行、工具调用、内置 Agent —— 已降为 **telencephalon 内的 native lobe** (prefrontal lobe), 不是独立一层 |
| **Hippocampus** (海马体) | `https://github.com/iBLOC/hippocampus` | 8081 (独立进程) | 长期记忆、HybridRAG 搜索; 桌面端进程内挂 `/hippocampus/api/*`, **只有一份** |
| **Shadow-Desktop** | `shadow-desktop/` | N/A | 桌面端 UI + sidecar 内的 大脑/端脑/叶区/neuron |
| **Shadow-Mobile** | `shadow-mobile/` | N/A | 移动端 UI + App 进程内的 `libencephalon.so` |
| **Shadow-ESP32** | `shadow-esp32/` | N/A | 边缘客户端原型 — **Zephyr 4.4.x + C + west**(`esp32s3_devkitc` 板级;v0.x 概念阶段;决策见 `shadow-esp32/docs/adr/0001-stack-choice-zephyr-c.md`;调研见 `shadow-esp32/docs/RESEARCH.md`)。通过 mDNS `_shadow._tcp` + A2A (JSON-RPC) 加入 Shadow 平台与 telencephalon 通信 |

## 移动端本地开发环境

CI 的 `Mobile Analyze` / `Mobile Test` 作业固定 **Flutter 3.47.8（Dart 3.13.7）**（Dart 版本对应 `pubspec.yaml` 的 `sdk: ^3.13.0`）。本地装同版本，analyze 结果才和 CI 可比。

- SDK：`C:\src\flutter`（用户级 PATH 已含 `C:\src\flutter\bin`），`flutter --version` = 3.47.8 / Dart 3.13.7
  - 2026-10-29 从 3.41.4 升上来：为了引入 `shadcn_ui`（nank1ro 的 Flutter ShadcnUI）并对齐 stable 最新版。
    该包要求 Flutter ≥3.41.0 / Dart ≥3.11.0，**3.41.4 其实也满足**；升级是顺带的现代化，不是硬门槛。
    升级可逆 —— `C:\src\flutter` 是 git checkout，回退执行 `git checkout 3.41.4` + 重新 `flutter upgrade` 即可。
  - Flutter 3.47.8 的 compileSdk / targetSdk 仍是 **36**、minSdk 24，**Android SDK 侧不用装新平台**。
- 拉依赖：`flutter pub get`（工作目录 `shadow-mobile/`）
- 复刻 CI：`flutter analyze --no-fatal-infos --no-fatal-warnings` —— issues 全是 warning/info 才算过（2026-10-28：74 issues，无 error）
- **CI 现在有移动端测试作业**（`Mobile Test`，2026-10-28 补上）。此前 `flutter test` 从未被任何自动化跑过，仓库里 201 个用例中 28 个是坏的，且**坏在三个方向**：① 多个屏幕（soul / mcp / skills / prompt-settings / model-settings / conversation）**硬编码中文文案**却断言英文；② 测试 MaterialApp 漏注册 `AppLocalizations.delegate` / `GlobalCupertinoLocalizations.delegate`，`AppLocalizations.of(context)!` 直接崩；③ `pumpAndSettle` 撞上 `CircularProgressIndicator` 这类无限动画必然超时。2026-10-28 全部修完，**201/201 全绿**（本地 exit 0）
- Windows 上 `flutter pub get` 末尾会因缺符号链接支持退出 1（Developer Mode 未开）。依赖其实已解析完，`analyze` / `test` 不受影响；要跑桌面端构建需管理员执行 `reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense /t REG_DWORD /d 1 /f`
- 根 `.gitignore` 原本忽略 `pubspec.lock` —— **2026-10-28 已改**（`dd16ffe`）：忽略规则移除、锁文件入库（48265 B），构建可复现了
- **移动端 l10n（2026-10-28 完成）**：移动端原先有 220+ 处硬编码中文（14 个屏幕 + features/ + widgets/chat/ + provider/service 层），英文界面下照样露中文。现已全部接入 `AppLocalizations`，arb 从 179 key 增到 **441 key**（`lib/l10n/app_en.arb` / `app_zh.arb`，`flutter gen-l10n` 生成到 `lib/generated/l10n/`）。
  - **有意保留中文的地方**：LLM 提示词与工具描述（`lib/agents/`）、关键词匹配表（`mnn_agent_integration.dart` 的 `_localKeywords`、`wake_word_service.dart`）、内部日志（`_log.info`）。这些不是 UI 文案。
  - **拿不到 `BuildContext` 的地方**（provider / notifier / model）用 `lib/l10n/current_l10n.dart` 的 `currentL10n()`。它读 `PlatformDispatcher.instance.locale` 而不是 `WidgetsBinding.instance.platformDispatcher` —— 后者要求 binding 已初始化，纯 Dart 单测和后台 isolate 里都会抛 "Binding has not yet been initialized"。
  - **测试断言不要写死中英文**：用 `test/widget/test_helper.dart` 的 `l10nOf(tester)`（取 widget 树里的 `AppLocalizations`）——翻译一改测试不用跟着改。
  - **`arb` 里不能有重复 key**：`openVoiceMode` 曾在 HEAD 里写了两遍，JSON 后者覆盖前者，代码实际拿到的是被遮住的那份。已改名 `openVoiceAssistant`。
- **`flutter test` 的两个本地坑**：① 上一次 `flutter test` 的输出管道被提前关闭会留下 `flutter_tester` 残留进程，占着 `build/native_assets/windows/sqlite3.dll`，下次跑会报 `PathExistsException: 当文件已存在时，无法创建该文件`。先 `Get-Process flutter_tester | Stop-Process` 再重跑。② `mavis-trash` 对 `build/` 下的文件会报「指定的路径无效」，清不掉就用 `flutter clean` + `flutter pub get`。

## Android 打包环境与 APK 验收

本机（Windows）已具备完整 Android 打包链路，均为免安装免管理员路线：

- JDK 17：Temurin 17.0.20.1 → `C:\src\jdk17`（用户级 `JAVA_HOME`）
- Android SDK：`C:\Users\87462\AppData\Local\Android\Sdk`（用户级 `ANDROID_HOME` / `ANDROID_SDK_ROOT`）。新 cmdline-tools 用 `android sdk install <pkg>@<ver>` / 路径式 `platforms/android-36` 语法，**旧 `sdkmanager` 已弃用**
- 关键组件：`platforms/android-36`（Flutter 3.47.8 compileSdk=36）、`ndk/30.0.14904198`（工程钉死版本）、`cmake/3.22.1`（AGP 默认版本）
- 打包：`flutter build apk --debug`（工作目录 `shadow-mobile/`）→ `build/app/outputs/flutter-apk/app-debug.apk`
- 产物验收三件套：`aapt2 dump badging <apk>`（包名/SDK/ABI）、`tar -tf <apk>`（列 `.so`）、`llvm-nm -D --defined-only <so>`（校验 JNI 导出符号）

**原生库打包陷阱（2026-10-28 修复，`69ff642`）**：`android/app/build.gradle.kts` 的 `externalNativeBuild` 必须写 `cmake { path = ... }`，否则 Flutter 的 Gradle 插件（`FlutterPluginUtils.forceNdkDownload`）会把 CMake 源目录改写成 flutter_tools 里那份**空的** CMakeLists.txt，`src/main/cpp/mnn_bridge.cpp` 永不编译，`libmnnbridge.so` 不进包。注意 **AGP 公共 DSL 里 `defaultConfig` 层的 `externalNativeBuild` 是 `ExternalNativeBuildFlags`（只有 cppFlags/arguments/abiFilters，没有 path/version）**，`path`/`version` 只能在**模块级** `android { externalNativeBuild { cmake { } } }` 上设置 —— 写错层级会报 "Unresolved reference"。

**jniLibs 的 ABI 覆盖（2026-10-28）**：`aapt2 dump badging` 报的 `native-code` 是 APK **声明**的 ABI 集合，跟包里实际有什么 `.so` 无关。`jniLibs/` 下**自带**的原生库（`libprefrontal_core_lib.so`、`libencephalon.so`）如果只放 arm64 一份，APK 在另两个 ABI 上装得上、跑起来却**没有那个运行时**——`System.loadLibrary` 抛 `UnsatisfiedLinkError`，Kotlin 侧按设计 catch 住降级（`init` 块不重抛，否则后续每次访问都变成接不住的 `NoClassDefFoundError`），表现为「嵌入式大脑/前额叶没起来」，**不是崩溃**。但对用户就是功能整个消失，且这种沉默降级很难在日志之外被发现 —— Gradle / Flutter 都不会替你补齐。验收要逐个 ABI 查：`tar -tf <apk> | Select-String 'lib/.*/libencephalon.so'` 应该每个 ABI 各一份。`libmnnbridge.so` 走 CMake 插件链路，AGP 自己会编全 ABI，不受这条影响。补齐方式见 `encephalon` 仓的 `scripts/build-android.ps1`（`-Target` 切 ABI），每个 Rust target 的 std 要单独 `rustup target add`。

**`abiFilters` 必须是 `=` 不是 `+=`（2026-10-28 修复）**：`android/app/build.gradle.kts` 里原本写的是 `abiFilters += listOf("arm64-v8a")` —— 但 Flutter 的 Gradle 插件会**先**按 target-platform 往 `abiFilters` 里塞进它认为要打的那几个 ABI（默认 arm64-v8a / armeabi-v7a / x86_64），`+=` 是**追加**，最终集变成「插件的三个 + 我们的一个」。而 `flutter build apk --target-platform android-arm64,android-x64` **改不动这个**（实测：命令行指定了，badging 里 `native-code` 仍是三个）。结果就是 APK 宣称支持 armeabi-v7a，包里却没有那个 ABI 的原生运行时。已改成 `abiFilters = listOf("arm64-v8a", "x86_64")`，取值必须与 `android/app/src/main/jniLibs/` 下实际有哪些 ABI 的库一致。

**armeabi-v7a：暂不支持（2026-10-29 决定）**。移动端**只发 `arm64-v8a` 与 `x86_64`**（`android/app/build.gradle.kts` 的 `supportedAbis = listOf("arm64-v8a", "x86_64")`，取 `=` 不是 `+=`）。**armv7 不是待解锁的 blocker，是明确不做**——所以「把 wasmtime 拆可选以支持 armv7」这件事的必要性消失了（wasmtime 拆可选现在只剩减体积的价值，见 §「端脑面裁剪」）。下面这段留作背景：

这一段原来写的是 Lance —— `lance-core-8.0.1/src/utils/cpu.rs` 的 SIMD 探测只有 `aarch64` / `x86_64` / `loongarch64` 三个 `#[cfg]` 分支，**没有 `target_arch = "arm"`**，32 位 ARM 上报 `error[E0308]: expected 'SimdSupport', found '()'`。**该阻断已消除**：`telencephalon` 把 `hippocampus-server` 改成了 optional、`hippocampus-storage` 依赖直接删掉，Lance 退出移动端依赖图（`cargo tree` 权威确认 **0 命中**，`.so` 里 7 处 "lance" 全是 `unb**alanced**` / `re**balance**` 这类子串巧合）。但 armv7 **仍然编不出来**，阻断点换成了 **`cranelift-codegen v0.107.2`**（wasmtime 的代码生成器）：它的 build.rs 探测目标 ISA 时报 `error when identifying target: "no supported isa found for arch 'armv7'"` → panic → build script exit 101。wasmtime 的来源是**两处非可选依赖**：`synapse` 的 `wasmtime = "20"`（注释写着 "always available — agents run in WASM by default"）与 `telencephalon` 的 `wasmtime = "20"`；`telencephalon` 里 `src/wasm/http_bridge.rs` 与 `src/mcp/instance_manager.rs` 直接用 `wasmtime::Module`。要真支持 armv7，得把 wasmtime 从 `synapse` / `telencephalon` 拆成可选并门控 WASM 相关模块。

**模拟器硬阻塞 / 真机已接入（2026-10-29 更新）**：本机 `systeminfo` 显示 `Virtualization Enabled In Firmware: No`、`HypervisorPresent=False`（AMD Ryzen 5 5600X，BIOS 未开 SVM），因此 Hyper-V / Windows Hypervisor Platform / Android Emulator hypervisor driver **全部不可用**；`aehd` 服务虽已安装但处于 Stopped，且当前 shell 非管理员。要跑模拟器必须先进 BIOS 开启 SVM 并重启。**但真机已接入**：`adb devices` 有设备 `ee6b4832`（Xiaomi 2106118C / odin，Android 13 / SDK 33，主 ABI `arm64-v8a`）。MIUI 会拦 adb 安装（`INSTALL_FAILED_USER_RESTRICTED`），要在手机安全中心关掉「安装监控」，或直接用文件管理装 `/sdcard/Download/shadow-debug.apk`。

## 桌面端系统提示词链路

桌面端「提示词设置」页（`/prompt-settings`，`PromptSettingsPage` + `promptStore`）的提示词要真正到达模型，**平台不同路径不同**，两条都要接：

- **桌面 Tauri 模式**（对话跑在内置 neuron 上，`streamMessageNeuron`）：提示词直接进本地消息历史的 system 消息。`composeSystemPrompt()` 的顺序是**内置基线在前、用户人设在后** —— 基线带着 Qwen3 的 `/no_think` 指令（功能性的，不能丢），人设放后面是因为越靠近用户轮次权重越高。
- **Web 模式**（对话走 telencephalon）：`createConversation({ system })` → 后端把提示词存成会话的 `[system] …` agent turn（`SYSTEM_TURN_PREFIX`，没有单独的列，也就不用改表结构）→ 发消息时 `system_prompt_of(&conv)` 取回 → 塞进 A2A 的 `metadata["system"]` → lobe 侧 `extract_system_prompt()` 取出 → `compose_system_prompt()` 拼在 lobe 基线之后。

**A2A metadata 通道**：`metadata` 走的是把整张表打包进 `metadata["name"]`（`__cortex_meta_v1__` 前缀，`encode_metadata_for_transport` / `decode_metadata_from_name`）。v1 线上协议只转发 `name` 这一个键，所以**加一个新字段不需要改 synapse、也不需要改线上格式** —— 只要 lobe 侧从解包后的 map 里读。

**为什么不用改独立 lobe 仓库（2026-10-28 核实）**：lobe 记录全是 `LobeKind::Native`，默认 agent `temporal` 命中 telencephalon 进程内的 `NativeLobeRegistry::with_temporal()` → 走 `LobeClient::NativeWithConfig`（进程内，metadata 完整保留），所以提示词能到。走 HTTP 的只有**不在 registry 里的 lobe**（`occipital`、mDNS 发现的外来 agent）。而独立的 `temporal` 仓库是 ASR/TTS/音频管线、`occipital` 是视觉管线（Mage-VL，只发 `role: "user"`），**两者都没有带 system 插槽的文本对话 LLM 路径** —— 文本对话只存在于 telencephalon 的 native `TemporalLobe`。所以远端仓库无需改动；真要让外部 agent 支持人设，得让对方自己解 `metadata["name"]`。

**桌面端页面的孤儿问题**：`src/pages/` 下出现过两次"写好了但没人引用"的页面（`RecordingPage` 被 `RecordingPanel` 取代后遗留、`PromptSettingsPage` 从未挂路由）。`src/__tests__/pageRouting.test.ts` 现在会挡住这类问题：每个页面模块必须被路由挂载，每条路由必须指向存在的页面。

**`scripts/ui-smoke.sh` 是"假绿"陷阱（2026-10-28 修复）**：它原本只判断 HTTP 200，而 Vite 对不存在的路径会回退到 index.html **同样返回 200**，所以缺失模块一律"通过"。现在改成从文件系统自动发现模块，并要求响应体不是 HTML 外壳。跑它需要先起 `pnpm dev`（脚本打的是 `http://localhost:1420`）。

## 移动端 agent 面：两套「方言」与嵌入式大脑

移动端有**两个** HTTP client，说的是**两种互不兼容的方言**。这是本轮最关键的事实 —— 搞混了就会出现「连接被拒」变「404」这种更难查的症状。

| client | 方言 | 路径 | 谁在用 |
|---|---|---|---|
| `TelencephalonClient` | **端脑方言** | `/shadow/v1/*`、`/api/telencephalon/*`、`/.well-known/agent.json`、`/api/flows`、`/models/providers` | 对话、会话列表、flow、agent(lobe) 列表、会话迁移 |
| `PrefrontalClient` | **前额叶方言** | `/api/sessions`、`/api/agents`、`/api/skills`、`/api/providers`、`/api/soul/*`、`/api/mcp/servers`、`/api/tasks`、`/api/conversations`、`/hippocampus/api/*` | soul / tasks / memory / providers / skills / mcp / agents 列表页、语音会话模式 |

**嵌入式大脑挂起来的那条面 = 端脑的 `cortex_router`**（`telencephalon::boot::cortex_router`），所以它**只说端脑方言**。

⇒ 规则：**端脑 client 指向嵌入式大脑；前额叶 client 不指**。把 `PrefrontalClient` 指过去毫无意义 —— 端脑面上一条前额叶路径都没有。

**已迁移到端脑方言的**（2026-10-28）：

- **对话**（`chat_provider.dart`）：`createConversation()` + `streamMessage()`（SSE `delta` 事件），与桌面端 `ConversationPage.tsx` 同一条链路。人设提示词走 `createConversation({ system })`。
- **会话列表**（`conversation_screen.dart`）：`listConversations()`。
- 端脑面**起不来时不动 client** —— 指向一个没人监听的端口比指向外部端脑更糟。

**仍然留在前额叶方言的**（端脑里**没有对应概念**，需要单独决定由零信任网络里的哪个服务提供）：

- soul / tasks / memory（hippocampus 概念 —— 记忆按用户的要求走网络上的 hippocampus，不在移动端本地）
- providers / skills / mcp / agents 列表页（前额叶的管理面，端脑的对应路径是 `/api/telencephalon/providers`、`/api/telencephalon/mcp/servers`、`/api/telencephalon/agents`，**响应结构也不同**，迁移要连模型一起改）
- 语音会话模式（`conversation_mode_provider.dart`）：WebSocket 走 `/api/sessions/{id}/audio` —— **端脑没有这个端点**，迁移前得先在端脑侧加。

**端脑没有会话删除端点**：`/shadow/v1/conversations` 只有 create / list / get / messages / import，没有 DELETE；`ConversationStore` 也没有 delete（hippocampus 的 `SessionManager` 只有 `close_session`）。桌面端同样没提供这个操作。移动端会话页的删除按钮因此移除 —— 留着一个必然 404 的按钮不如不留；真要删，得先在端脑侧把「删会话」还是「close 会话」定下来。

**移动端不编本地海马体**（记忆走零信任网络内其它设备）⇒ `telencephalon` 把 `hippocampus-server` 改 optional、`hippocampus-storage` 依赖直接删掉。**Lance 退出移动端依赖图**（实测 mobile profile 的构建日志里没有 `lance` crate）。但 **DataFusion / Arrow / Parquet 还在** —— 那是 `telencephalon` **自己**用的（皮层下数据网关的 SQL 引擎，`telencephalon/Cargo.toml` 里的 `datafusion = "55"`），不是 Lance 拖进来的。Lance 退出后，**armeabi-v7a 的硬阻断（`lance-core` 的 SIMD 探测没有 `target_arch = "arm"` 分支）消失**；紧接着发现 armv7 还有第二个阻断（cranelift / wasmtime），而 **2026-10-29 已决定移动端暂不做 armv7**，只发 `arm64-v8a` + `x86_64`。

## 移动端嵌入式前额叶（Prefrontal .so）

链路：Flutter → MethodChannel(`com.ibloc.shadow/prefrontal_runtime`) → `PrefrontalRuntimeService`(Kotlin) → JNI → `libprefrontal_core_lib.so`(Rust) → axum mini HTTP server(localhost)。

**注意措辞**：这一段嵌的是**前额叶（前额叶 = telencephalon 管的 lobe 之一）**，不是「大脑」本身。桌面端已经升级成嵌**大脑**（`encephalon::Embedded::boot()`，见 `shadow-desktop/src-tauri/src/lib.rs`），两端嵌的运行时**目前不是同一个**——这是已知的不一致，见下。

**2026-10-28 之前这条链路从未通过**，三个原因都在 prefrontal 仓：

1. `mobile` feature **编译不过**（`AgentBuilder::build()` 改成返回 `Result`、`AppState::agent_store` 是字段不是方法、`agent::Agent` 没有 `spec.id`/`runtime_mut().with_model()`）—— `scripts/build-android.sh` 一直在构建一个不存在的东西。
2. 仓库里**没有任何 JNI 入口**。`prefrontal_mobile_*` 是普通 C 符号（裸指针），Kotlin 的 `external fun` 找不到它们 → `UnsatisfiedLinkError`。已在 `src/mobile/jni.rs` 补上 6 个 JNI 入口（`Java_com_ibloc_shadow_PrefrontalRuntime_*`）。
3. `scripts/build-android.sh` 有六处硬伤（末尾多余 `EOF` 让 `set -e` 直接失败、产物改名成 `libprefrontal_mobile.so` 而 Kotlin 要 `prefrontal_core_lib`、JNI 头文件符号前缀写错、输出目录指向 prefrontal 自己的 `android/`、覆盖全局 `~/.cargo/config.toml`、API level 硬编码 24 而 minSdk 是 31）。

**怎么产出 `.so`**（在 prefrontal 仓）：

```bash
# 默认只编 arm64（41MB），装进 shadow-mobile 的 jniLibs
./scripts/build-android.sh aarch64-linux-android
# 显式指定 App 目录
./scripts/build-android.sh aarch64-linux-android --output /path/to/shadow-mobile
```

脚本会用 `llvm-nm` 校验 6 个 JNI 符号确实导出 —— **「编译成功」不等于「Kotlin 调得到」**（符号名写错的话 loadLibrary 能成功但 native 调用必炸）。

**`.so` 不入库**：它是兄弟仓库源码的构建产物（40MB/ABI），按需构建。`.gitignore` 里排除了它；jniLibs 里的 MNN 那几个是 vendored 第三方二进制，仍然入库。

**`.so` 缺失时必须优雅降级**：`PrefrontalRuntime` 的 companion `init{}` **不要重抛** `loadLibrary` 的失败 —— 重抛会让类初始化失败，之后每次访问变成 `NoClassDefFoundError`，而调用方接的是 `UnsatisfiedLinkError`（Error 不是 Exception，`catch (e: Exception)` 接不住）→ App 崩。现状是：不重抛 + 5 个 native 调用点各自 catch `UnsatisfiedLinkError`，于是错误以正确形态落进 `MainActivity` 已有的 `SO_NOT_LOADED` 分支。

**跨端不一致（2026-10-28 核实，未解决）**：桌面端嵌的是**大脑**，移动端嵌的是**前额叶**。

| 端 | 嵌入的运行时 | 证据 |
|---|---|---|
| shadow-desktop | `encephalon`（大脑） | `src-tauri/src/lib.rs`：`embedded_stack: Arc<encephalon::Embedded>` + `encephalon::Embedded::boot(EmbeddedConfig { neuron_port: 8085 })`；`Cargo.toml` 里 `encephalon = { path = "../../../encephalon" }`，且注释写明「旧的 cortex sidecar 模式 DEPRECATED (2026-09-22)，由 embedded encephalon 取代」「The embedded encephalon is the ONLY place shadow gets inference from」 |
| shadow-mobile | `prefrontal`（前额叶） | 本节的 `libprefrontal_core_lib.so`；prefrontal 仓 `src/mobile/{mod,jni}.rs` |

移动端**主链**已经是端脑（`engine_models_provider.dart`：`http://localhost:60080`，注释「Telencephalon is the single platform entry point」）。**2026-10-28 已把移动端代码里残留的 `:8082` 全部收口**：4 处纯端口残留（服务健康检查清单 / continue-on-desktop 手工端点 / localPeer / 注释）改为 `:60080`，日志流改连本机嵌入式前额叶的真实端口，另 3 处属于不可达的 WebRTC companion 死代码已整段删除。于是手机上有两套 agent 运行时：主链走端脑、嵌入支线跑前额叶 —— 手机本地拿不到端脑编排的各 lobe（temporal / occipital / parietal），且与桌面端行为不一致。

**改嵌「大脑」的成本**（2026-10-28 核实 + **实测交叉编译**，不是换个 `.so` 那么简单）：`encephalon` / `telencephalon` 目前**没有 cdylib crate-type、没有 JNI 层、没有 android feature**。要嵌进 App 需要：① 加 `crate-type = ["cdylib"]`；② 重写一套 JNI 入口（prefrontal 那套 6 个入口是照它自己的 API 写的）；③ 整条依赖树交叉编译到 `aarch64-linux-android`；④ **至少改一处依赖声明**（见下）。

**实测结果**（NDK 30.0.14904198 / `aarch64-linux-android` / release；探针脚本 `shadow-mobile/scripts/android-cross-probe/`，可复跑）：

| 依赖 | 强制？ | 结果 |
|---|---|---|
| `synapse`（含 wasmtime 20 + cranelift） | 是 | ✅ 通过，3m21s，`libsynapse.rlib` 25.0 MB |
| `neuron`（candle 全 optional；**没有 wgpu** —— burn/burn-store 只在 `voxcpm` feature 下） | 是 | 未验，形态友好：`Cargo.toml` 已有 `crate-type = ["staticlib","cdylib","rlib"]` |
| `hippocampus-storage`（`lance-graph`，default feature 就开着） | 端脑是 / 大脑可选 | 未验 |
| `diencephalon`（`datafusion 55` + `arrow` + `zenoh` + `zen-engine`） | 是 | ❌ **失败** |
| `prefrontal` | 是 | ✅ 通过（已产出 arm64 `.so`，6/6 JNI 符号） |

**第一个真 blocker 是 `rquickjs-sys`，不是 `wasmtime`** —— wasmtime 20 + cranelift 干净编到了 Android。失败点：`zen-engine 2.1.4` → `rquickjs` → `rquickjs-sys 0.10.0` 只为 14 个平台提供预生成绑定，**没有 Android**（`aarch64-linux-android` 那个 `.rs` 根本不存在）。`zen-engine` 是 `diencephalon` 真在用的 DMN/JDM 规则引擎（`diencephalon/src/rule_engine.rs`），不是死依赖。三条修法：① 开 `zen-engine/bindgen` feature（官方逃生舱，但需要 libclang —— 本机 `C:\Program Files` 下没有 `libclang.dll`，rustup 也没装 llvm-tools 组件）；② 把 `zen-engine` 改成 optional feature（移动端不带 DMN 规则求值，**推荐这条**，只改 `diencephalon/Cargo.toml` 一行）；③ fork `rquickjs-sys` 补绑定（最脏）。

体积：prefrontal 已 40MB，`synapse` 单独一个 rlib 就 25MB。全栈合成单个 `.so` 有撞 Android 单库 150MB（未压缩）上限的风险 —— **未实测**。

功能上也**部分重叠**：桌面端「唯一推理来源 = 嵌入的大脑」在移动端不成立 —— 移动端另有 LiteRT / MNN 本地推理（`litert_engine.dart` / `mnn_engine.dart`），而端脑默认 feature 绑了 `neuron` + `candle`。所以「移动端该嵌哪个」是个需要决策的事，不是显然的替换。

**宿主 JVM 直测（2026-10-28 补上，`prefrontal` 仓 `scripts/jni-host-test/`）**：模拟器跑不起来时，「`.so` 编出来了」和「Kotlin 真的调得到」之间会断一层 —— JNI 是**按名字**解析符号的（`Java_<包名>_<类名>_<方法名>`），符号名写错的话 `llvm-nm` 看得到符号、Kotlin 一调却 `UnsatisfiedLinkError`。做法是把同一个 Rust cdylib 交给**宿主 JVM**，用与 Kotlin 侧同包同名的 Java 类去调，验证符号解析、`String` 编解码（含中文与 emoji 等增补平面字符）、`byte[]` 回写、mini HTTP server 起来了、以及 JNI → Rust → HTTP → mock LLM → 原路返回的端到端往返。**12 项断言全绿**。

```powershell
$env:JAVA_HOME='C:\src\jdk17'
& C:\Projects\iBLOC\prefrontal-wt-jni\scripts\jni-host-test\run.ps1
```

为此 `prefrontal` 的 `jni` 从「仅 Android target 的依赖」改成 `mobile` feature 的可选依赖（`mobile = ["dep:jni"]`），`Cargo.lock` 不用动（lock 格式不分 dev / 普通依赖）。

**嵌入式运行时的 LLM 端点（2026-10-28 修）**：`prefrontal_mobile_register_agent` 里 provider 用的是 `OpenAiProvider::new(&LlmConfig::default())`，和传给 agent 的 `llm_config` 是**两个不同对象** —— 于是请求地址永远是 `api.openai.com`、永远没有 key，嵌入式运行时此前调不通任何模型。现在 provider 与 agent 共用同一份 `llm_config`，端点 / 密钥从 `PREFRONTAL_LLM_BASE_URL` / `PREFRONTAL_LLM_API_KEY` 读（不设就是原默认值）。

**孤儿页已处理（2026-10-28）**：`prefrontal_mobile_cluster_page.dart` 之前是孤儿页，但它是嵌入式大脑的唯一 UI，而嵌入式大脑正是活链路 —— 所以**接进路由**（`/settings/prefrontal`，设置页有入口），而不是删掉。另一套「外部进程架构」的 `prefrontal_cluster_page.dart` / `prefrontal_provider.dart` / `prefrontal_service.dart` 构成自引用闭环、零外部引用，已连同 ~107 处硬编码中文一起删除；`lib/services/prefrontal/README.md` 重写成实际架构。

**已知缺口**：CI 不构建 Rust，所以 CI 出的 APK 没有这个 `.so`。`libencephalon.so` 已构建 **arm64-v8a 与 x86_64** 两个 ABI；**armeabi-v7a 与 x86 暂不做**（2026-10-29 决定，移动端只发 arm64-v8a + x86_64）。

## 环境变量

桌面端 sidecar **实际读取**的（`src-tauri/src/`）：

```bash
# 端脑 / 调试
export TELE_PORT="60080"                  # 端脑端口（旧名 CORTEX_PORT 仍兼容）
export TELE_SKIP_NEURON="1"              # 跳过 neuron 启动（调试；旧名 CORTEX_SKIP_NEURON）
export LANCE_URI="..."                    # 海马体存储位置（端脑 / 海马体读）
export RUST_LOG="info"                    # 日志级别

# 宿主 RPA —— 默认关，没有任何生产路径会自动打开
export SHADOW_COMPUTER_USE_ENABLED="1"

# 飞书 MCP（应用级授权）
export FEISHU_ENABLED="1"
export FEISHU_APP_ID="..."
export FEISHU_APP_SECRET="..."
export FEISHU_DEFAULT_USER_EMAIL="..."

# 测试
export TAURI_TEST_NO_SINGLE_INSTANCE="1"
```

E2E / CI：

```bash
export SHADOW_CORTEX_BIN="<path>/telencephalon"   # 外部端脑二进制
export SHADOW_CORTEX_CWD="<path>"                  # 它的工作目录
export SHADOW_FULL_STACK="1"                       # 打开硬断言（软跳过 → 真跑）
```

neuron 侧（兄弟仓）：`NEURON_PORT`（默认 8083）、`NEURON_DEFAULT_SOURCE`（默认 `modelscope`）。

> ⚠️ 旧的 `RESONANCE_HOST` / `PREFRONTAL_HOST` / `HIPPOCAMPUS_HOST` / `PREFRONTAL_MODE` / `SHADOW_ID` / `MTLS_*_PATH` 在 shadow 代码里**没有任何消费方** —— 只在旧测试配置和历史文档里出现过。端脑地址在桌面端是写死的 `http://127.0.0.1:60080`（`telencephalonStore.ts` 的 `DEFAULT_BASE_URL`），移动端由嵌入式大脑的随机端口接管。

## 相关项目

| 项目 | 路径 | 说明 |
|------|------|------|
| **Encephalon** (大脑) | `https://github.com/iBLOC/encephalon` | 顶层 agent crate（间脑 + 端脑 + 单一 neuron） |
| **Telencephalon** (端脑) | `https://github.com/iBLOC/telencephalon` | agent 运行时：会话 / agent registry / A2A / WASM / MCP / 叶区 |
| **Neuron** (推理) | `https://github.com/iBLOC/neuron` | 单二进制推理运行时（LLM/TTS/ASR/Rerank） |
| **Prefrontal** | `https://github.com/iBLOC/prefrontal` | 端脑内的 native lobe（任务） |
| **Hippocampus** (海马体) | `https://github.com/iBLOC/hippocampus` | 长期记忆存储、HybridRAG |
| **Shadow** | `https://github.com/iBLOC/shadow` | 用户分身系统（本仓） |
| **Shadow-Desktop** | `shadow-desktop/` | 桌面端 (Tauri 2 + React 19) |
| **Shadow-Mobile** | `shadow-mobile/` | 移动端 (Flutter 3.47.8 + shadcn_ui) |

## 技术栈

| 层级 | 移动端 | 桌面端 |
|------|--------|--------|
| **UI 框架** | Flutter 3.47.8 | React 19 + Tauri v2 |
| **UI 组件** | shadcn_ui (Flutter ShadcnUI 0.57.3) | shadcn/ui (Radix + CVA) + Tailwind 3.4 |
| **状态管理** | Riverpod 2.5 | Zustand 5 |
| **路由** | GoRouter 14 | React Router 7 |
| **大脑** | `libencephalon.so`（App 进程内） | Rust sidecar（`encephalon::Embedded::boot()`） |
| **对话后端** | 端脑方言 `/shadow/v1/*` | 端脑方言 `/shadow/v1/*`（`127.0.0.1:60080`） |
| **本地推理** | MNN / LiteRT 引擎封装（不在对话链路上） | neuron (embedded at :8085) |
| **Agent2UI** | flutter_genui + genui_a2ui | React 19 + Tauri commands |
| **后端** | Kotlin (Android) | Rust (Tauri shell) |
| **IPC** | MethodChannel + JNI + HTTP | Tauri invoke + HTTP |

## 外部集成

### MNN (移动端本地推理)
- 阿里巴巴深度学习推理引擎
- 支持本地 LLM 运行
- GitHub: github.com/alibaba/MNN

### ~~candle-vllm~~ (桌面端本地推理 — 弃用)
- ~~Rust 原生 vLLM 实现~~
- ~~GitHub: github.com/EricLBuehler/candle-vllm~~
- **现状 (2026-07-19)**: 已被 `neuron` 取代; neuron 由大脑进程内嵌, 桌面端在 Tauri shell 里以 `:8085` 提供推理服务, 默认 candle runtime。candle-vllm 不再作为桌面端默认引擎。

### flutter_genui (移动端 Agent2UI)
- 对话式 Agent UI
- 自动化操作支持
- GitHub: github.com/fluttergenui

### ~~CopilotKit~~ (桌面端 Agent2UI — 弃用)
- ~~AI 助手集成框架~~
- ~~GitHub: github.com/CopilotKit/CopilotKit~~
- **现状 (2026-07-19)**: Shadow-Desktop 实际采用 React 19 + Tauri commands + 原生 React 组件而非 CopilotKit。CopilotKit 仅在早期设计评估阶段被考虑, 未实际落地。

### 魔搭社区
- 模型下载平台
- 支持 MNN 和 candle 格式模型
- modelscope.cn

## Recent changes (2026-09-24 / 2026-09-25)

39+ commits landed after the 2026-09-23 audit cycle. Highlights (full e2e gap analysis in [`2026-09-25-e2e-coverage-assessment.md`](docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md)):

| Area | Change | Commits |
|---|---|---|
| **hippocampus 任务板接入双端** (2026-10-28) | 桌面端 `CortexTaskSection` 挂进 TaskBoardPage（hippocampus 任务列表 + 详情/编辑弹窗 + 刷新/删除）；移动端任务卡片可点开详情，编辑弹窗从"写好了没人引用"变成真能走通；两端统一遵守 `TaskRecord` 契约 —— 标题/描述/优先级没有对应列，编辑只暴露后端真正持久化的状态与标签，客户端建的标题改放 `payload`；修移动端 `createTask` 缺 `taskId`/`targetAgent`（后端 400）、看板漏掉 failed/cancelled 两列、读取失败从不显示；桌面端新增 `silent` 选项避免挂载即弹全局错误框 | `2f8b472`, `c3221d0`, `c53c256` |
| **Benchmark harness 收口 + 双被测物真跑分** (2026-10-26/27) | τ²/SWE/GAIA/TB 四套件适配器全部入库可复跑（4042 行 WIP 收口）；agentic 模式真落地（此前 `[agent.mode]` 被 serde 静默丢弃）；跨模型 2×4 矩阵（deepseek/MiMo）；**shadow-desktop 被测物首个完整真跑分**（core-smoke 6/10，wdio 真应用栈）；behavior delta=产品边界（desktop 0/5 vs encephalon 5/5，对话路径无动作面）；修复 6 个 harness 缺陷（cmd.exe 吞 POSIX、answer_contract 丢失、hidden_files 不物化、孙进程管道挂死、180s 误杀→task_timeout_secs）+ 2 个环境问题（pytest editable 污染、WAT 违反 ABI）+ **neuron KV cache 竞态**（chat() reset/generate 分窗，77+58=135，neuron `2bce199`）；prefrontal 定时任务落地（`39563ad`）。总成绩单见 `benchmark/docs/benchmark-positioning.md` §3.5 | `b6ef666`…`3199b15`（shadow 15+）、prefrontal `39563ad`/`18fd479`、neuron `2bce199` |
| **ACP outbound delegation** (2026-09-27, local) | prefrontal `acp_delegate` tool + `acp_outbound` registry dispatch tasks to ACP coding agents (OpenCode / Claude Code / Codex) via `synapse::acp::AcpClient`; `Config.acp` presets; `acp_stub_agent` test double; synapse fix: `session/update` chunks were silently dropped (SessionNotification envelope) | uncommitted in `prefrontal` / `synapse` |
| **Rename chain closed** | cortex → encephalon → **telencephalon** (`telencephalon` is the active repo; `cortex/` directory is empty) | `b077a24`, `7128409`, `b0af1d7`, `f2d0015` |
| **Port unification** | :8443 → `:60080` across all lobes (cortex/temporal/occipital/parietal `CORTEX_URL`) | `2757fea` |
| **4-lobe GitHub homes** | Final decision: bare names `iBLOC/{temporal,occipital,parietal,prefrontal}`. `parietal-lobe/` skeleton superseded. Workflow schema + runtime moved to `cerebellum/` (2026-09), then **on to `telencephalon/crates/` 2026-10-14**. | `1dd1f0c`, `d7cfec7`, `43f9e97` |
| **cerebellum 概念废弃（2026-10-29）** | 工作流职能 2026-10-14 已整体迁入端脑（`telencephalon/crates/workflow-{schema,runtime,engine,trace}` + `apps/editor` + `docs/workflow/`），此后该仓只剩一个**零代码**的「具身智能预留」占位（无实现、无 roadmap、全栈无 path 依赖 / 无 CI / 无代码引用）⇒ **概念判为过时，仓库退役**。迁移表 + `flow`/`workflow` 分工 + 「agent = flow 中的一环」公理 + Phase 2 待办已归入 `telencephalon/AGENTS.md`；过期指针（parietal README/AGENTS、shadow-desktop AGENTS、telencephalon Cargo.toml 注释）同步改正。⚠️ 端脑编辑器仍带旧品牌（`Cerebellum Workflow Studio` / 包名 `cerebellum-editor` / localStorage key `cerebellum.workflow.*`）—— 改名会丢用户本地草稿，属独立决策 | `df048a6`（旧预留仓） |
| **Recording mode R1-R4** | RecordingPage UI + Tauri commands (recording_start/stop/status/events/list/report) + lobe ownership rule (音频→颞叶 / 视觉→枕叶) + recording summary + LanceGraph edges | `a1e3509`, `de0913e`, `8520c31`, `afa8d60`, `3600166`, `30d7f59`, `0390379`, `856621c`, `965bc15`, `ec467b7` |
| **MCP catalog 5×28 + transport-aware MCPPage** | stdio / http / wasm transports, 5 built-in servers × 28 tools; button import fixes | `ccae5ce`, `1c0c3ec`, `5679021`, `f02ba35` |
| **Workflow Studio v1 (R-12/R-13 closure)** | Drag-drop editor, originally `cerebellum/apps/editor`, now **`telencephalon/apps/editor`** (2026-10-14) + Univer locale deps | `4023493`, `93f4ef9` |
| **Subsystem management panel** | 3-tier auth client (thalamus / hippocampus / neuron preview/config) | `cd84a71` |
| **Cortex sidecar → embedded encephalon** | Tauri shell boots `Encephalon` + `diencephalon::Thalamus` in `setup()` | `be50b7f` |
| **Computer Use R-10/R-11** | 11 `cu_*` commands + ComputerUsePage + Windows UI Automation + preview-before-commit modal | `84418a2`, `9c46327`, `c37b163`, `b5743fc` |
| **browser-use R-08/R-09** | WebviewWindow per-task + PreviewButton + PreviewsPage | `b834d20`, `858f0df` |
| **Document productization DOC-01..05** | `<UniverSheet>` + `/document/:taskId` route + Feishu MCP bridge + open-lark backend + FeishuPublishedCard + Feishu Settings toggle + per-task result management with local git | `2bb8932`, `90878db`, `00c43fc`, `d7d1466`, `8bbc260`, `2aa0d3b` |
| **AudioEventChip R-01** | R-11 SSE schema + UniverSheet i18n | `c08da1d` |
| **History tab R-04/05** | TaskDetailDialog | `f246c31` |
| **shadow-desktop build fixes** | ziti-sdk patch + dep-graph + API-drift fixes; i18n JSON repaired; pnpm tauri dev running | `cc1b787`, `2fee8eb`, `73b4cda`, `8f01cde`, `89e478b` |
| **hippocampus voiceprint store** | Embedding table for audio enrolment (BC-01 pipeline anchor) | `6aea5e1` |
| **diencephalon BC-01** | `subscribe_audio` / `unsubscribe_audio` MCP tools + `Thalamus::stream` public method | `7593343`, `4e96474`, `8fc67d9` |
| **neuron** | `neure → neuron` rename; `AppState::register_engine`; test count → 618 | `e3d2c41`, `bccef7c` |
| **synapse** | `transport::ziti` module + A2A metadata wire-forwarding via `__encephalon_meta_v1__` + audio providers | `8ff2294`, `135f1fd`, `cdb6249` |

For the end-to-end coverage assessment of all the above (which has zero e2e in CI today), see the companion E2E assessment doc.

## 设计规范版本控制策略

`/home/ibloc/Projects/docs/superpowers/specs/` **不是 git 仓库**。架构规范（如 `2026-06-04-shadow-architecture-redesign.md`）的修改不进入 git 历史，依赖**手动 SOP 同步**。

决策记录（2026-06-08 → 2026-06-09）：评估 neuron 重构后的代码/文档对齐时，Layer 2 ENGINE 块加入了 neuron 说明。该修改已反映在以下文档中：
- `/home/ibloc/Projects/AGENTS.md` PROJECTS 表（neuron 列入 Layer 2，synapse 列为 shared/突触层）
- `/home/ibloc/Projects/docs/architecture.md`（完整架构图 + 内嵌 Mermaid + 生物类比 §8）
- `/home/ibloc/Projects/docs/diagrams/architecture.mmd`（SVG/PNG 渲染源文件）
- `https://github.com/iBLOC/hippocampus/AGENTS.md`（synapse path dep 关系说明）
- 8 个项目根目录分别放置了 `ARCHITECTURE.md` 指针文件

