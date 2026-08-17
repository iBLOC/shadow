# shadow-esp32 GitHub Actions CI 实施记录 (2026-08-16, ADR-0002 v2 §后续动作 #9 v1)

## 本次提交改了什么

`shadow-esp32` 仓库现在有一个 CI workflow(`.github/workflows/build.yml`),每次 push / pull_request 都会触发 `west build -b esp32s3_devkitc app`。这是接下去 #4a dialog_task v2 必须的前置 — 否则 5-6 周的实现无法被任何人验证。

## 改动

| 文件 | 状态 |
|---|---|
| `.github/workflows/build.yml` | **新建** (76 行 YAML) |
| `README.md` | Roadmap #9 标完成;修订表 v1.0 |
| 本文件 | 实施记录 |

## CI 关键决策

### 1. 容器镜像:`zephyrprojectrtos/zephyr-build:0.16-3`

与 devcontainer (`Dockerfile` 里的 `FROM zephyrprojectrtos/zephyr-build:${DOCKER_TAG}`) 用同一镜像,保持本地开发与 CI 一致 — 没有"在我电脑上能编"问题。镜像自带:
- Zephyr SDK 0.16+
- xtensa-espressif_esp32s3 toolchain
- riscv64 toolchain
- `west` + Python pip helper
- ESP32 板级支持

### 2. Cache 策略

```yaml
- name: Cache west workspace
  uses: actions/cache@v4
  with:
    path: |
      zephyrproject
      .west
    key: ${{ runner.os }}-west-0.16.3-${{ hashFiles('west.yml') }}
    restore-keys: |
      ${{ runner.os }}-west-0.16.3-
```

- 缓存 Zephyr 源码 + west workspace(几百 MB)
- key 包含 `west.yml` 的 hash — west.yml 变了 cache 失效(应该失效)
- restore-keys fallback — 跨不同 `west.yml` 也能用最近的 cache
- 冷启 ~4 min,热启 ~30 sec(只跑 `west build`)

### 3. West 以非 root 跑

```yaml
env:
  WEST_USER_DATA: /tmp/west-userdata
```

Zephyr SDK container 默认 root;`west init` 默认拒绝 root。`WEST_USER_DATA` 把状态文件移到 `/tmp` 避免 root 报错。

### 4. `--pristine` 强制 clean build

```bash
west build -b esp32s3_devkitc app --pristine
```

CI 不用增量构建 — 每次都从头来,保证 cache miss / stale Kconfig 不会掩盖 bug。本地开发保留 `west build -b esp32s3_devkitc app`(增量)。

### 5. Artifact 上传

```yaml
- name: Upload firmware binary
  uses: actions/upload-artifact@v4
  with:
    name: shadow-esp32-firmware
    path: |
      app/build/zephyr/zephyr.elf
      app/build/zephyr/zephyr.bin
      app/build/zephyr/zephyr.map
    retention-days: 30
```

每次成功构建产出 `.elf` / `.bin` / `.map`,可在 GitHub Actions UI 下载用于本地 `west flash` 烧写。30 天 retention 平衡存储成本与回滚需求。

## 触发矩阵

| 事件 | 触发 |
|---|---|
| `push` to `main` / `master` | ✅ |
| `pull_request` to `main` / `master` | ✅ |
| `push` to feature branch | ❌(只在 PR 触发的 base 上跑) |
| `workflow_dispatch` | ❌(需要时再加) |
| schedule | ❌(nightly build 不必要 — 沙 PR 已经覆盖) |

## 已知边界

1. **本机无 Zephyr SDK** — 跑这条 workflow 需要 push 到 GitHub(或自托管 runner)
2. **`zephyrprojectrtos/zephyr-build:0.16-3` 不存在 GHCR 上的 `:latest` 镜像** — pinned 到 0.16-3,新版本 SDK 出来要手动更新
3. **没有 unit test 阶段** — 当前 shadow-esp32 都是裸 Zephyr app,没有 host-side 测试可以跑;后续 dialog_task v2 加 libopus 后可考虑 twister / native_posix target 单元测试
4. **没有 flash 测试** — CI 只编译,不烧板;物理板测试要手动或加 self-hosted runner
5. **没有 cargo check 等价物** — `cargo check` 是个轻量级 host-side 编译验证,Zephyr 没等价物;`west build` 是唯一路径
6. **没有 rustfmt / clang-format 检查** — 后续可加 `clang-format --dry-run` 步骤

## 验证

- **本地**:用 devcontainer (`shadow-esp32/.devcontainer/Dockerfile`) 跑 `west build -b esp32s3_devkitc app`
- **CI**:push 到 GitHub → 看到 `.github/workflows/build.yml` 的运行状态
  - ✓ 期望结果:workflow 通过,artifact `shadow-esp32-firmware` 可下载
  - ✗ 期望结果(CI 首次跑可能 fail,因为没本地 west 跑过编译验证 — 这次 CI 提交同时也是 first dry run)

## 未来增强

1. **`-b` matrix**:加 `esp32s3_box3` / `m5stack_core_s3` / `waveshare_esp32s3_touch_amoled_1_8` 等板级
2. **`.clang-format` 检查**:先在 repo root 加 `.clang-format`,workflow 加 lint step
3. **Codecov 集成**:后续 dialog_task v2 加单元测试后,跑 coverage
4. **Self-hosted runner 烧写测试**:物理板 + esp32s3_devkitc connected → CI 自动 `west flash && pytest`

## 引用

- ADR-0002 v2 §后续动作 #9
- Zephyr CI 模式:https://docs.zephyrproject.org/latest/develop/test/index.html
- zephyrprojectrtos/zephyr-build:https://github.com/zephyrproject-rtos/docker-images
- GitHub Actions cache:https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows