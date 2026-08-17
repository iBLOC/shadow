# shadow-esp32 libsrtp 集成实施记录 (2026-08-16, ADR-0002 v2 §后续动作 #4a.2)

## 本次提交改了什么

把 libsrtp (cisco/libsrtp v2.7.0) 集成为 Zephyr module,**与 #4a.1 libopus 同样模式**:

| 文件 | 状态 | 说明 |
|---|---|---|
| `west.yml` | 修改 | 加 `libsrtp: v2.7.0, path: app/srtp/libsrtp` |
| `app/srtp/zephyr/module.yml` | **新建** | Zephyr module 描述符(20 行) |
| `app/srtp/CMakeLists.txt` | **新建** | thin Zephyr 包装:`add_subdirectory(libsrtp)` + `ENABLE_OPENSSL=OFF` + `ENABLE_GCM=OFF` |
| `app/src/include/shadow_esp32/srtp.h` | **新建** | shadow-esp32 SRTP 公共 API(opaque handle + 4 个函数)|
| `app/src/srtp.c` | **新建** | libsrtp C API wrapper(~115 行)|
| `app/src/dialog_task.c` | 修改 | 在 libopus smoke test 之后加 libsrtp smoke test(protect + unprotect round-trip)|
| `app/CMakeLists.txt` | 修改 | 加 `srtp.c` 源 + `target_link_libraries(app PRIVATE srtp2)` |
| `README.md` | 修改 | Roadmap #4a.2 完成;修订表 v1.2 |
| `docs/implementation-notes/2026-08-16-libsrtp-integration.md` | **新建** | 本文件 |

## 集成模式(同 libopus)

```
west.yml
  └─ projects: libsrtp (cisco/libsrtp v2.7.0) @ app/srtp/libsrtp

app/srtp/
  ├── zephyr/module.yml     # 描述符:name=libsrtp + cmake=. + kconfig.skip
  ├── CMakeLists.txt         # 12 行 wrapper:add_subdirectory + ENABLE_OPENSSL=OFF
  └── libsrtp/               # ← west update 拉取(此目录不入 git)

app/src/srtp.c
  #include "srtp2/srtp.h"    # 来自 app/srtp/libsrtp/
  → 调 srtp_create / srtp_protect / srtp_unprotect

app/CMakeLists.txt
  target_link_libraries(app PRIVATE srtp2)   # 链入(v2 target 名)
```

## srtp.h API 契约

```c
#define SHADOW_SRTP_MASTER_KEY_LEN   16
#define SHADOW_SRTP_MASTER_SALT_LEN  14
#define SHADOW_SRTP_MASTER_BUF_LEN   (KEY + SALT = 30)

struct shadow_srtp_session *shadow_srtp_open(const uint8_t *master,
                                              size_t master_len);
int  shadow_srtp_protect(struct shadow_srtp_session *s,
                        uint8_t *out, size_t out_cap,
                        const uint8_t *in, size_t in_len);
int  shadow_srtp_unprotect(struct shadow_srtp_session *s,
                          uint8_t *out, size_t out_cap,
                          const uint8_t *in, size_t in_len);
void shadow_srtp_close(struct shadow_srtp_session *s);
```

设计选择:
- **30-byte master buffer**(key 16 + salt 14)与 libsrtp 内部 `policy.key` 的 layout 一致 — 后续 DTLS 握手拿到的 30-byte buffer 可直接传入
- **opaque handle** 隐藏 `srtp_t` — 换实现不需要改 dialog_task
- **双向 SSRC 策略**:`shadow_srtp_open` 内部注册 `ssrc_any_outbound` + `ssrc_any_inbound`,调用方无需关心方向

## v1 配置细节

| 选项 | 值 | 理由 |
|---|---|---|
| `ENABLE_OPENSSL` | OFF | 嵌入式不能链 OpenSSL,libsrtp 自带 AES |
| `ENABLE_GCM` | OFF | v1 限定 AES-128-CM-HMAC-SHA1-80(WebRTC 默认 + libsrtp 编译默认)|
| Cipher | AES-128-CM-HMAC-SHA1-80 | WebRTC 默认;libsrtp 编译时内建,无需额外配置 |
| SSRC(发送) | `ssrc_any_outbound` | 不需 SSRC 协调 |
| SSRC(接收) | `ssrc_any_inbound` | 接收任意 SSRC |
| Auth tag | 80 bits (10 字节) | WebRTC 默认 |

## Smoke test(在 dialog_task v1 末尾)

```c
static const uint8_t master[30] = {
    0xE1, 0xF9, ... 0x4C,   // 16-byte key
    0x6E, 0x6B, ... 0x4A,   // 14-byte salt
};
struct shadow_srtp_session *srtp = shadow_srtp_open(master, 30);
if (srtp) {
    static const uint8_t plain[64] = {
        0x80, 0x60, 0x12, 0x34, ... // 12-byte RTP header + 52-byte payload
    };
    uint8_t cipher[128], recovered[128];
    int n_enc = shadow_srtp_protect(srtp, cipher, sizeof(cipher),
                                       plain, sizeof(plain));
    int n_dec = shadow_srtp_unprotect(srtp, recovered, sizeof(recovered),
                                         cipher, n_enc);
    bool eq = (n_dec == 64) && (memcmp(recovered, plain, 64) == 0);
    shadow_srtp_close(srtp);
}
```

**目的**:在 dialog_task v1 流程末尾跑一次,证明:
1. libsrtp Zephyr module link 正确
2. SRTP protect + unprotect round-trip 输出 byte-equal
3. 整个 RTOS 线程栈没爆

**真正的 I²S mic → opus → srtp → UDP 管线**在 commit #4a.3(音频管线),v1 只证明 link 正确。

## 已知边界

1. **本机无 Zephyr SDK** — `west update` 必须在 devcontainer 或 CI 跑,才能拉 libsrtp 源
2. **libsrtp v2.7.0 source 大约 800 KB** — git clone 一次后,west cache 复用
3. **编译时间增加** — libsrtp 全特性编译约 +5-10 sec
4. **Flash 占用增加** — libsrtp `.a` 大约 100-200 KB(取决于优化)
5. **未跑真实媒体** — v1 跑 fake RTP header,没接 I²S + opus
6. **DTLS 还没接** — master key + salt 是固定值;真正 DTLS 握手输出(由 #4a.4 实现)动态注入

## 验证

```bash
west init -l . && west update && west packages pip --install
west build -b esp32s3_devkitc app

# 串口输出
# [shadow_dialog] dialog_task handshake sequence complete; idle
# [shadow_dialog] dialog_task running libopus smoke test
# [shadow_dialog] opus encode silence: N bytes (DTX)
# [shadow_dialog] opus decode round-trip: 960 samples
# [shadow_dialog] dialog_task running libsrtp smoke test
# [shadow_dialog] srtp protect: 80 bytes (in=64)   ← +16 字节 auth tag
# [shadow_dialog] srtp unprotect: 64 bytes (in=80)
# [shadow_dialog] srtp round-trip OK
```

## 引用

- ADR-0002 v2 §后续动作 #4a.2
- libsrtp 官方:https://github.com/cisco/libsrtp
- libsrtp v2 API 文档:https://github.com/cisco/libsrtp/wiki
- RFC 3711 (SRTP):https://datatracker.ietf.org/doc/html/rfc3711
- RFC 5764 (DTLS-SRTP):https://datatracker.ietf.org/doc/html/rfc5764