# iBLOC dev firewall — 使用说明

## 为什么需要
每次 `cargo build` 产出新 exe（哈希变了），Windows 防火墙把它当
"新程序"弹授权。路径规则（按目录放行、不校验哈希）一次配置永久生效。

## 执行（一次）

1. 按 Win 键 → 输入 `powershell` → 右键 **Windows PowerShell** →
   **以管理员身份运行**
2. 粘贴：

```powershell
powershell -ExecutionPolicy Bypass -File C:\Projects\iBLOC\shadow\scripts\dev-firewall.ps1
```

3. 看到 "Done." 即成功。以后编译不再弹防火墙授权。

## 脚本做什么

- 扫描 `C:\Projects\iBLOC\*\target\{debug,release}` 与
  `target-acp\release`，外加 `shadow/shadow-desktop/src-tauri/target`
- 为每个目录添加**入站路径规则**（Private + Domain profile，
  不含 Public——咖啡店 WiFi 下仍然受保护）
- 幂等：重跑先删旧 `iBLOC dev:*` 规则再重建（新仓库自动纳入）

## 已知服务端口（被上述路径规则覆盖，仅文档用途）

| 端口 | 服务 |
|---|---|
| 60080 | telencephalon（端脑网关） |
| 8085 | neuron embedded (Tauri) |
| 18082 | prefrontal serve |
| 19082 | parietal-server (behavior stub) |
| 8082 | encephalon a2a_server / diencephalon |
| 8081 | hippocampus |
| 8080 | resonance |
| 7447 | zenohd router |
| 7777 | diencephalon MCP HTTP |
| 1420 / 5173 | vite dev servers |

## 验证

```powershell
Get-NetFirewallRule -DisplayName "iBLOC dev:*" | Measure-Object | Select-Object -ExpandProperty Count
```
返回的数字 = 已添加的规则数（应等于脚本列出的目录数）。
