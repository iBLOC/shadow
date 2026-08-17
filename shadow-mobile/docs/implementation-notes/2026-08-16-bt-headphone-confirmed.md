# shadow-esp32 + shadow-mobile 蓝牙耳机路径确认 (2026-08-16)

## 答案

shadow-esp32 端 + shadow-mobile 端都已支持蓝牙耳机路径,零代码改动。这是 Android 系统级标准行为。

## 完整数字人直播流(已全部支持)

```
shadow-esp32 ◀──── USB Audio OUT ──────── Android Phone (shadow-mobile)
                ◀──── 蓝牙 A2DP ────→ BT ──→ 蓝牙耳机(用户选)
                (系统自动路由,无需写代码)
```

- USB Audio → shadow-esp32 音箱(v2.4 ✅)
- 蓝牙耳机(标准 Android)→ 无需改动
- 两者同时 → system mix

## 用户操作(零代码改动)

1. 插入 shadow-esp32 USB-C(已配网)
2. 蓝牙耳机配对:设置 → 蓝牙 → 配对 AirPods / Sony WH-1000XM5
3. 系统设置 → 音频 → 选"蓝牙耳机"
4. 推流 app 播放 → 自动通过 BT 耳机输出

**shadow-esp32 仍照常被 USB-C 供电(数据线可拔,只留电源)**,蓝牙耳机替代音箱。

## 实施记录:零代码改动

| 文件 | 状态 |
|---|---|
| shadow-esp32/* | 零改动 |
| shadow-mobile/* | 零改动(Android 系统级路由) |
| `docs/implementation-notes/2026-08-16-v2.5-android-ble-provisioning.md` | 完成 |

## 已知边界(v2.6 评估)

如果用户希望**方案 B**(shadow-esp32 做 BT A2DP sink),真新功能,~500-700 LOC,2-3 周开发,用 ESP-IDF `a2dp_sink` 集成。v2.5 不做。

## v2.5 milestone 完成

从 0 开机 → 配网 → 直播流 → 蓝牙耳机输出全部支持,代码改动 = BLE provisioning + USB Audio routing。
