# shadow-esp32 dialog_task v1 + ws_client 实施记录 (2026-08-16, ADR-0002 v2 §后续动作 #3 v1 子任务)

## 本次提交改了什么

把占位心跳 `dialog_task.c` 替换为**真实 WebSocket signaling client 流程**:
- `app/src/ws_client.{h,c}`(397 行)— 独立、可复用的最小 RFC 6455 WebSocket 客户端
- `app/src/dialog_task.c`(256 行,38 行占位 →)— UUID 生成 / ICE 凭据 / SDP offer / JSON 序列化 / 端到端流程
- `app/prj.conf` 加 `CONFIG_SHADOW_CORTEX_HOST/PORT/MODALITY`
- `app/CMakeLists.txt` 注册 `ws_client.c`

## ws_client 设计

**最小 RFC 6455 客户端**,只支持 dialog_task 需要的部分:

| 功能 | 实现状态 |
|---|---|
| TCP 连接 + DNS 解析 (Zephyr `getaddrinfo`) | ✅ |
| HTTP/1.1 Upgrade handshake (RFC 6455 §1.3) | ✅ |
| 16-byte 随机 Sec-WebSocket-Key (RFC 6455) | ✅ (`sys_csrand_get`) |
| Base64 编码 (key + 自己手写,无外部依赖) | ✅ |
| Masked text frame 发送(RFC 6455 §5.3) | ✅ |
| 服务器发来的 text frame 接收 + 控制帧处理 | ✅ |
| Ping 自动 Pong 回复 (RFC 6455 §5.5.3) | ✅(在 `read_one_frame` 内) |
| Close frame 1000 (RFC 6455 §5.5.1) | ✅(在 `shadow_ws_close` 内) |
| TLS (`wss://`) | ❌ 后续 commit 加 mbedtls client profile |
| Fragmented frame (FIN=0) | ❌ 后续(当前 `read_one_frame` 拒绝) |
| Binary frame 解析 | ⚠️ 当前能解析但当文本(后续按需加强) |

## dialog_task v1 端到端流程

```c
k_sem_take(&shadow_net_wifi_up);             // 等 net_task 完成 Wi-Fi
uuid_v4_string(session_id);                  // 生成 UUID v4
shadow_ws_connect(host, port, path);         // TCP + HTTP Upgrade
random_ice_credentials(ufrag, pwd);          // RFC 5245 §7.1.2.3
build_sdp_offer(...);                        // a=rtpmap:111 opus/48000/2
build_offer_json(...);                       // {"type":"offer",...}
shadow_ws_send_text(ws, offer);              // 发 SignalingMessage::Offer
shadow_ws_recv_text(ws, buf);                // 收 cortex Connected + Answer
shadow_ws_send_text(ws, disconnect);          // 发 SignalingMessage::Disconnected
shadow_ws_close(ws);                         // 关闭
```

**当前状态**:
- HTTP Upgrade + Sec-WebSocket-Key 解析 + 101 Switching Protocols 响应处理
- 完整 SDP offer(含 audio/opus/rtpmap/fingerprint/ice-ufrag/ice-pwd)生成
- cortex 端 forward_offer_to_lobe 把 SDP 推给 temporal lobe,后者用 webrtc-rs 生成 Answer
- Answer 解析(目前用 `strstr` 找 `"session_id":"..."` 字段,后续 commit 改用完整 JSON 解析)
- Disconnected 收尾

## 模块 API

```c
/* ws_client.h — 公共 API */
enum shadow_ws_result {
    SHADOW_WS_OK = 0, SHADOW_WS_ERR_RESOLVE = -1, ...
};
int  shadow_ws_connect(const char *host, uint16_t port, const char *path);
int  shadow_ws_send_text(int fd, const char *payload, size_t len);
int  shadow_ws_recv_text(int fd, char *buf, size_t cap);
void shadow_ws_close(int fd);
```

## 关键 Kconfig (`app/prj.conf`)

```kconfig
CONFIG_SHADOW_CORTEX_HOST="cortex.local"
CONFIG_SHADOW_CORTEX_PORT=60080
CONFIG_SHADOW_MODALITY="voice"
```

## SDP offer 模板(由 `build_sdp_offer` 生成)

```
v=0
o=- 1234567890 2 IN IP4 0.0.0.0
s=-
t=0 0
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:<random-8-char>
a=ice-pwd:<random-24-char>
a=fingerprint:sha-256 11:22:33:...   (placeholder,后续 commit 改真 DTLS)
a=setup:actpass
a=mid:0
a=sendrecv
a=rtcp-mux
a=rtpmap:111 opus/48000/2
a=fmtp:111 minptime=10;useinbandfec=1
```

## 已知边界

1. **本机无 Zephyr SDK** — 验证只能在 devcontainer / CI 跑 `west build`
2. **DTLS fingerprint 是占位**(`11:22:33:44:...`)— 后续 commit 加 mbedtls PSK + 真 fingerprint
3. **Answer 解析是 naive strstr** — `session_id` 字段足够定位;Answer 完整 SDP 解析留给后续 commit
4. **没有 ICE candidate 实际收集** — 当前 SDP 没有 `a=candidate:` 行(后续加 uNET / RICE 收集)
5. **没有重连** — 当前 dialog_task 一次性握手;成功后 k_sleep 退出

## 验证

```bash
# devcontainer
west init -l . && west update && west packages pip --install
west build -b esp32s3_devkitc app

# 烧写 + 串口监控
west flash && west debug

# 应看到
# [shadow_dialog] dialog_task started; waiting for Wi-Fi
# [shadow_net] wifi connected; signaling shadow_net_wifi_up
# [shadow_dialog] Wi-Fi is up; opening signaling channel
# [shadow_dialog] session_id=<uuid>
# [shadow_ws] ws handshake ok: fd=N host=cortex.local path=/api/webrtc/voice/sessions/<uuid>/ws
# [shadow_dialog] offer sent (N bytes)
# [shadow_dialog] ws frame received (M bytes): {"type":"answer",...}
# [shadow_dialog] cortex echoed session_id=<uuid>
# [shadow_dialog] dialog_task handshake sequence complete; idle
```

## 引用

- ADR-0002 v2: `shadow-esp32/docs/adr/0002-shadow-esp32-implementation-architecture.md` §4.3 + §后续动作 #3
- cortex `webrtc_route.rs`: `https://github.com/iBLOC/cortex/src/api/webrtc_route.rs`
- cortex `SignalingMessage`: `https://github.com/iBLOC/cortex/src/webrtc/mod.rs`
- RFC 6455: https://datatracker.ietf.org/doc/html/rfc6455
- Zephyr Wi-Fi API: https://docs.zephyrproject.org/latest/connectivity/networking/api/wifi.html