# 大脑的密钥仓库：keyring-core 方案评估

> 2026-11-02 · **评估（未落地，等拍板）** · 下面每一条事实都当场核对过（crate 版本、前置条件、代码落点都是读到的，不是猜的）

## 0. 结论

**可行，方向对** —— 但它不是「加一个依赖」，而是**一次存储模型的重排**：密钥从「值」变成「引用」，真相源从「Turso 的一列」变成「操作系统的凭据仓库」。

三个必须一起解决的前置条件（缺一个，方案就退化成「换个地方存明文」）：

1. **大脑里要有一层 `SecretStore` 抽象**，而不是业务代码直接调 keyring —— 否则测试不可控、平台分支会渗进业务。
2. **Turso 里只能存引用**，不能存明文 —— 否则「从类 SQLite 里直接取到 key」这件事根本没被堵住。
3. **存量明文要迁移并擦除** —— 迁移完不擦，等于什么都没做。

两个**需要拍板**的决定见 §6：**密钥的主人是谁**（今天有两个大脑进程）、**存量明文怎么擦**（不可逆）。

---

## 1. 存量盘点（实测）

| # | 位置 | 装的是什么 | 载体与落盘方式 | 谁直接能读 |
|---|---|---|---|---|
| 1 | `~/.local/share/shadow/providers.json`（端脑；`TELENCEPHALON_PROVIDERS_FILE` 可改） | 供应商注册表，**含 `api_key` 明文** | `ProviderStore::save_to_file`（`telencephalon/src/api/providers.rs:299-304`）用 `fs::write` 整份明文写盘；路径在 `src/api/mod.rs:87-99` | 任何能读该用户文件的东西（备份同步、扫描、别的进程） |
| 2 | Turso `config_entry.value` | 配置中心的**全部 secret 值**：供应商 key、`hippocampus.storage_access_key` / `storage_secret_key` | `config_center/store.rs` 的 INSERT 写明文 ⇒ ⇒ **`secret` 列只是「读的时候换成 `***`」的标记**（`redact` / `REDACTED`）⇒ ⇒ **落盘仍是明文** | 拿到 libSQL 文件或远程 Turso 的人 |
| 3 | `%APPDATA%\shadow\config.json`（桌面端） | `provider_config.api_key` + 数据库密码 | `shadow-desktop/src-tauri/src/config_manager.rs:32`（字段）与 `:54`（路径） | 同上 |
| 4 | `%APPDATA%\shadow\admin.key`（桌面端） | admin token（32 字节随机 hex） | `src-tauri/src/admin_token.rs:56-58`（Unix 0600 / Windows 靠目录 ACL） | 同用户进程 |
| 5 | `localStorage['shadow-admin-token']`（web 版） | admin token | 浏览器 localStorage（`src/lib/adminToken.ts`） | 任何 XSS / 任何能读浏览器 profile 目录的东西 |
| 6 | `~/.shadow/providers.json`（桌面端旧本地注册表） | 明文 key（一次性导入源） | 文件 | 同上 |
| 7 | **移动端** | —— | **没有任何安全存储**：pubspec 无 `flutter_secure_storage`，Rust 侧无 `ndk_context` | —— |

⚠️ 第 2 条的性质值得单独说：`secret` 列是**读面**的脱敏标记，不是加密 ⇒ ⇒ **「类 SQLite 里的 key 被直接获取」今天确实成立**，而且它不止影响供应商 key，还包括海马体的对象存储凭据。

---

## 2. 三个选择的可行性核对（逐条）

### 2.1 keyring-core —— ✅ 选它，而且**别选 `keyring` 外壳**

实测：

- `keyring-core` **1.0.1**（2026-10-13，MIT OR Apache-2.0，rust-version 1.85，edition 2024）
- trait 是 **`CredentialStoreApi`（store 级）+ `CredentialApi`（条目级）**
- `set_default_store(Arc<CredentialStore>)` 是**进程级全局** ⇒ ⇒ 只能 **boot 时选一次**
- `Entry::new(service, user)`；`set_password` / `get_password` / `set_secret` / `get_secret` / `delete_credential`
- ⚠️ **`CredentialStoreApi::build(service, user, modifiers)` 给 store 级构造** ⇒ ⇒ **测试可以不起全局**（用内存 store 单独构造）—— 这条对「单测要能跑」很关键

**为什么不用 `keyring` 外壳（4.2.0）**：它的 **default feature 同时打开 `apple-native-keyring-store` + `windows-native-keyring-store` + `zbus-secret-service-keyring-store`** ⇒ ⇒ Android 目标上会拖进一堆无关 store（zbus 要 DBus），Linux 分支还可能把 `openssl-sys` 拖进来 —— 而这个仓的 Android 交叉编译**已经被 openssl 咬过一次**（`telencephalon/Cargo.toml` 里 reqwest `default-tls` 那段注释）。

⇒ ⇒ **依赖 `keyring-core` + 按 target 选具体 store crate**，正是你提的那个形状。

### 2.2 android-native-keyring-store —— ✅ 可行，但有**两条硬前置**

实测（README + crate 元数据）：

- **1.0.0**（2026-04-21），**rust-version 1.88** ⇒ ⚠️ 端脑自己声明 1.85 ⇒ 要抬 MSRV 或锁 CI 工具链（本机 `rustc 1.96.0` ✅）
- 实现：**每个 store 名一条专用 SharedPreferences 文件 + 一条专用 Android Keystore 条目** ⇒ ⇒ 落盘是密文，密钥在 Keystore 里**不可导出** ⇒ ⇒ 拿到 App 私有目录也解不开
- ⚠️ **前置 1：Kotlin 侧必须初始化 ndk-context** —— 加 `io.crates.keyring.Keyring` Kotlin 类，`onCreate` 里 `initializeNdkContext(applicationContext)`
- ⚠️ **前置 2：`libandroid_native_keyring_store.so` 要进 `app/src/main/jniLibs/<abi>/`**（arm64-v8a / x86_64）—— 本仓已有 `android/app/src/main/cpp/mnn_bridge.cpp` 这个 JNI 壳，在那儿挂即可
- ⚠️ **版本语义**：0.x 是「每个 **service** 一份偏好文件 + 一条 Keystore 条目」，1.x 是「每个 **store** 一份」⇒ ⇒ 迁移期别混（crate 有 `legacy` feature）

**为什么手机上是对的选择**：手机上的大脑是**进程内**的 —— `encephalon/Cargo.toml` 的 `mobile` feature 写得很直白：「**the brain running inside the Android app**」⇒ ⇒ 密钥落在 App 沙箱 + Keystore ⇒ **别的 App 拿不到**（比桌面端「同用户可读」强一档）。

### 2.3 Tauri 桌面端 —— 建议：**Rust 侧直连，不要 JS 插件**

桌面端这台机器上跑的是 **`shadow-desktop.exe` 内嵌的大脑**（`src-tauri/src/telencephalon_http.rs` 起端脑面绑 `127.0.0.1:60080`）⇒ ⇒ 大脑要的密钥**根本不需要经过 Tauri / JS** ⇒ Rust 侧直接 `keyring-core` + `windows-native-keyring-store`（Windows 凭据管理器）即可。

若 UI 侧确实要写密钥（用户现场输入一个 API key），建议**单向写**：前端把值传给一条 Tauri 命令 → Rust 写进钥匙环 → **不回读**（命令返回「写好了 / 没写成」，不是 key 本身）。

社区已有 **`tauri-plugin-keyring-store` 0.2.0**（基于 keyring-core 1.x、Stronghold 形状的 JS API、无快照文件、Android 走 Keystore + SharedPreferences）⇒ ⇒ **能用**，但不推荐当主路径：① 它把密钥交给 JS（多一层暴露面）；② 默认带 `crypto` feature（iota-crypto）；③ Linux 需要 Secret Service ⇒ ⇒ 留作「没有 Rust 侧可用」的备选。

---

## 3. 建议的架构：引用式密钥

Turso 里存**指针**，不存材料：

```json
{"$secret": {"store": "keyring", "handle": "3f0c…uuid", "hint": "sk-…a91c", "updated_at": "2026-11-02T09:00:00Z"}}
```

- `handle` = 钥匙环里的 account 名（随机 uuid）⇒ ⇒ 泄露 Turso 只能拿到一串无意义 id
- `hint` = 尾 4 位 ⇒ ⇒ 界面不需要明文也能说人话
- `provider_id → handle` 的映射在 Turso —— **那不是秘密**

**解析时机**：大脑**出站调供应商时**才解析成明文（进程内、用完即弃）⇒ ⇒ 明文永远不进 HTTP 响应、不写日志、不进 Turso。（读面今天已经只回掩码 ⇒ 保持；写面掩码往返不洗掉真值今天也已有 ⇒ 保持。）

**落点按运行形态选**：

| 运行形态 | store crate | 备注 |
|---|---|---|
| 桌面端内嵌大脑（Windows） | `windows-native-keyring-store` | 凭据管理器；同用户进程可读（见 §5） |
| 桌面端内嵌大脑（macOS） | `apple-native-keyring-store` | 钥匙串 |
| Android App 内嵌大脑 | `android-native-keyring-store` | Keystore（见 §2.2） |
| 无头 Linux 服务器 | `linux-keyutils-keyring-store`（内核 keyring，**不需要 D-Bus 会话**） | ⚠️ `zbus-secret-service-keyring-store` 在服务器上通常**没有会话钥匙环** ⇒ 不能当默认 |
| 远程/共享大脑，要「连库也是密文」 | `db-keystore` **0.6.0** | **加密 SQLite**（turso 实现），`aegis256` 等 cipher ＋ 256-bit hexkey ⇒ 密钥材料在 Turso 里是密文；⚠️ **那把 hexkey 自己还得放在别处**（钥匙环 / 口令文件）⇒ 它是**兜底**不是替代 |
| CI / 无凭据仓库 | keyring-core 的 mock store / `db-keystore` 的 `vfs=memory` | 只给测试 |

**引导密钥的悖论（必须一起处理）**：Turso 地址 + token、admin token、shadow key **本身也是秘密** ⇒ ⇒ 它们也得进钥匙环，**宿主在 boot 时取出来** ⇒ ⇒ 这样「环境变量不是门」那条结论**更强**：钥匙从 OS 凭据仓库出，不落环境变量、不落明文文件 —— 今天的 `admin.key` 明文文件正是这条的反例。

---

## 4. 桌面端的具体建议

1. **别让 admin token 进 JS**：今天 `invoke('get_admin_token')` 把 token 交给前端、前端再放进每个请求头 ⇒ ⇒ webview 内存里长期躺着一把钥匙；web 版还落 `localStorage`。⇒ ⇒ 建议 Rust 侧代理带钥匙（前端只拿短期会话令牌），或至少**别再落 localStorage**。
2. **桌面端自己那份明文迁走**：`config.json` 的 `provider_config.api_key` + 数据库密码、`admin.key` ⇒ 全部进同一把钥匙环，键名分层（`shadow/<purpose>`）。
3. **插件只在必要时用**：需要 UI 现场写密钥 ⇒ 单向写命令；`tauri-plugin-keyring-store` 留给「没有 Rust 侧可用」的场景。
4. **⚠️ 桌面端 exe 在这台机器链不出来**（lance 的 rlib 1.75 GB ⇒ `link.exe` 峰值 4–9 GB ⇒ LNK1102）⇒ ⇒ 桌面端这条链**无法真机验证** ⇒ 落地时要另找取证办法（例如单独起一个最小 Tauri 命令，验证凭据管理器里真的出现条目）。

---

## 5. 威胁模型：解决什么、不解决什么

**解决**

- 磁盘被捞走 / 备份被同步走 / libSQL 文件被拷走 / 远程 Turso 被 dump ⇒ ⇒ **拿不到明文 key**（今天最大的洞：上面 #1 #2 #3 #4 #6 全在这个洞里）
- 手机：别的 App 拿不到（沙箱 + Keystore 不可导出）
- 截图 / 肩窥 / 界面回显 —— 今天读面已经只给掩码，这条本来就成立

**不解决**

- **同一用户身份下运行的恶意进程**：Windows 凭据管理器同用户可读；Linux 同样是同用户可读
- **大脑进程被攻陷**：解密后明文在内存里 ⇒ ⇒ 内存转储 / 进程注入仍能拿到
- **用户自己把 key 贴进日志 / 工单 / 聊天**

⇒ ⇒ 剩下的三道闸仍然是：**读面永不回明文**（今天有）、**写面掩码往返不洗真值**（今天有）、**任何日志不落 key**（今天有规矩）。

⚠️ 一条容易被忘的推论：**远程大脑比本地大脑更安全** —— 密钥根本不在这台机器上 ⇒ ⇒ 「大脑是唯一真相源」这条决定，在安全上站在有利一边。

---

## 6. 需要拍板的两件事

### ① 密钥的「主人」是谁？

今天有**两个大脑进程**：桌面端内嵌的（`telencephalon_http.rs`）＋ Android App 内嵌的（`encephalon` 的 `mobile` feature）⇒ ⇒ 两把各自的钥匙环 ⇒ ⇒ **桌面端配好的 key，手机上那份大脑解不开**（引用看得见，明文取不到）。

- **(a) 单主人**：指定一台大脑是密钥宿主，其他设备通过主人面解析（新增一条 owner 门后的内部面）⇒ 最干净，但要加一条端脑↔端脑内部协议
- **(b) 每设备一份**：Turso 按 device_id 分槽，密钥各存各的 ⇒ 「两端用同一张面改同一份配置」**只在非密钥项上成立** ⇒ 必须写进台账，不能假装
- **(c) 共享主密钥**：一把主密钥进各设备的钥匙环，密钥材料用 `db-keystore` 加密后放 Turso ⇒ 材料仍只有一份，但「导出的主密钥」本身需要用户确认

⇒ ⇒ 我倾向 **(a)**（最符合「大脑负责路由和分发」），退而求其次 (c)。

### ② 存量明文怎么擦？

不可逆 ⇒ ⇒ 需要确认：**迁移完直接擦掉** `providers.json` / Turso 旧行 / `config.json` 里的明文，还是**先备份一份再擦**（建议：备份到用户目录 + 明确告知备份文件本身仍是明文）。

---

## 7. 分阶段落地（每阶段都有可查的读数）

| 阶段 | 做什么 | 验收 |
|---|---|---|
| P0 | **闸**：禁止明文 secret 进 Turso / 进文件（写库前命中 secret 键且值不是引用 ⇒ 直接报错；源码级扫描明文 `api_key` 赋值） | 闸红绿可复现；故意写回明文 ⇒ 恰好红 |
| P1 | 大脑加 `SecretStore` trait ＋ `BuildOptions.secret_store`；实现 `KeyringSecretStore`（keyring-core ＋ 按 target 的 store）＋ `InMemorySecretStore`（测试） | `cargo test --lib` 绿；反向验证（拆掉 store ⇒ 恰好红） |
| P2 | 配置中心支持引用式 secret（`config_entry` 加 `secret_ref` 列，或值改成引用对象）；provider 写入改「写钥匙环 ＋ 存引用」 | 真 HTTP 复验：Turso 里 grep 不到 `sk-` |
| P3 | 存量迁移（**幂等 ＋ 回滚标记**，照抄桌面端 providers 一次性导入那套） | 迁移后旧文件里没有明文；重复跑不炸 |
| P4 | 两端客户端：界面不再显示明文；桌面端 admin token / Turso 令牌进钥匙环；Android 侧补 Kotlin `ndk_context` 初始化 ＋ jniLibs | 真机：Keystore / 凭据管理器里能看到条目 |
| P5 | 反向验证 ＋ 真机复验 | 「把写库路径改回明文 ⇒ 恰好红」 |

⚠️ **P1 的落点**：`telencephalon/src/boot.rs` 的 `BuildOptions`（已有 `flow_dir` / `identity_dir` / `hippocampus_data_dir` / `conversation_store_file` / `control_plane` 这类「宿主注入」字段）⇒ ⇒ **`secret_store` 加在同一处**；桌面端 `telencephalon_http.rs:145` 与 Android 的 boot 各自注入自己的 store。

---

## 8. 核过的每一条事实（可复查）

| 事实 | 来源 |
|---|---|
| `keyring` 4.2.0；default = apple + windows + zbus-secret-service；另有 android / dbus / linux-keyutils / db-keystore | https://docs.rs/crate/keyring/4.2.0/features |
| `keyring-core` 1.0.1（2026-10-13，rust 1.85，edition 2024）；trait = `CredentialStoreApi` + `CredentialApi` | https://crates.io/api/v1/crates/keyring-core ；https://docs.rs/keyring-core/1.0.1/keyring_core/api/index.html |
| `android-native-keyring-store` 1.0.0（2026-04-21，**rust 1.88**） | https://crates.io/api/v1/crates/android-native-keyring-store |
| Android store = SharedPreferences ＋ Keystore，**每个 store 名一条**；需 ndk-context 初始化；`.so` 需进 jniLibs | https://github.com/open-source-cooperative/android-native-keyring-store （README） |
| `db-keystore` 0.6.0 = 加密 SQLite（turso），cipher `aegis256` ＋ 256-bit hexkey，依赖 `keyring-core ^1.0` | https://github.com/stevelr/db-keystore （README）＋ crates.io 依赖表 |
| `tauri-plugin-keyring-store` 0.2.0（社区，基于 keyring-core 1.x） | https://github.com/s00d/tauri-plugin-keyring-store |
| 手机上的大脑是 App 进程内跑的 | `C:\Projects\iBLOC\encephalon\Cargo.toml` 的 `mobile` feature 注释 |
| 端脑 providers.json 明文落盘 | `telencephalon/src/api/providers.rs:299-304`、`src/api/mod.rs:87-99` |
| 配置中心 secret 只在读面脱敏 | `telencephalon/src/config_center/store.rs`（`redact` / `REDACTED`） |
| 桌面端 config.json 明文存 api_key | `shadow-desktop/src-tauri/src/config_manager.rs:32,54` |
| admin token 明文文件 | `shadow-desktop/src-tauri/src/admin_token.rs:56-58` |
| 本机工具链 | `rustc 1.96.0` / `cargo 1.96.0` |

---

## 9. 边界

- **本轮没有改任何代码** —— 这是评估，不是实现；等 §6 两个决定拍板再动
- 端脑仓此刻有并行会话在飞（`telencephalon/src/api/providers.rs` 等 30+ 文件）⇒ ⇒ 真要动手，**先确认没人正在改同一批文件**
- 桌面端 exe 在这台机器链不出来 ⇒ ⇒ 桌面端那条链**无法真机验证**
- 「端脑 `/v1/*` 不过门」那笔旧账仍在这笔之外，未动
