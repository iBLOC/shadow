/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §4.3 / §后续动作 #3 — dialog_task v1.
 *
 * Scope of v1 (this file):
 *   - Wait for Wi-Fi (`shadow_net_wifi_up`)
 *   - Generate a UUID v4 session id
 *   - Open a WebSocket signaling channel to cortex's
 *     `/api/webrtc/voice/sessions/{id}/ws` endpoint
 *   - Build a syntactically valid SDP offer (audio + opus +
 *     DTLS fingerprint placeholder + ICE credentials) and send
 *     it as `SignalingMessage::Offer`
 *   - Receive `SignalingMessage::Connected` + `Answer` and log
 *   - Open a UDP socket on the negotiated media port, run a
 *     receive loop that dispatches STUN Binding Requests, decrypts
 *     SRTP-protected opus packets, and routes MCP-over-data-channel
 *     JSON-RPC requests to io_task.
 *   - Send `SignalingMessage::Disconnected` on shutdown.
 *
 * v1.5 of this file ties together every WebRTC sub-module
 * previously stubbed in isolation: STUN Binding responses, SRTP
 * unprotect, MCP JSON-RPC dispatch. The receive loop runs in the
 * dialog_task thread context (real Zephyr BSD socket recvfrom).
 *
 * Out of scope (follow-up commits):
 *   - Real DTLS handshake over a real socket — v2.2.1 stubs the
 *     PSK + key export; the actual handshake needs a connected
 *     UDP socket pre-DTLS; we currently have only the post-DTLS
 *     SRTP path.
 *   - Real ICE connectivity checks — v1 receives STUN but does
 *     not initiate them. Followup pulls `rfc8445` state machine.
 *   - SCTP-over-DTLS data channel — v1 uses a raw UDP "data
 *     channel" transport (JSON-RPC over UDP) as a stand-in. The
 *     framing helper `sctp_agent.c` already produces the right
 *     byte layout; plugging in usrsctp is the next commit.
 *   - State machine transitions on voice / TTS / wake-word.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/random/random.h>
#include <zephyr/net/socket.h>

#include <ctype.h>
#include <string.h>
#include <stdio.h>

#include <shadow_esp32/tasks.h>
#include <shadow_esp32/ws_client.h>
#include <shadow_esp32/audio.h>
#include <shadow_esp32/audio_pipeline.h>
#include <shadow_esp32/srtp.h>
#include <shadow_esp32/dtls.h>
#include <shadow_esp32/ice.h>
#include <shadow_esp32/stun.h>
#include <shadow_esp32/io_tools.h>

LOG_MODULE_REGISTER(shadow_dialog, CONFIG_SHADOW_ESP32_LOG_LEVEL);

#ifndef CONFIG_SHADOW_CORTEX_HOST
#define CONFIG_SHADOW_CORTEX_HOST "cortex.local"
#endif
#ifndef CONFIG_SHADOW_CORTEX_PORT
#define CONFIG_SHADOW_CORTEX_PORT 60080
#endif
#ifndef CONFIG_SHADOW_MODALITY
#define CONFIG_SHADOW_MODALITY "voice"
#endif

K_THREAD_STACK_DEFINE(dialog_stack, SHADOW_DIALOG_STACK_SIZE);
static struct k_thread dialog_thread;

static void uuid_v4_string(char out[37])
{
    uint8_t b[16];
    sys_csrand_get(b, sizeof(b));
    b[6] = (b[6] & 0x0F) | 0x40; /* version 4 */
    b[8] = (b[8] & 0x3F) | 0x80; /* variant 10 */
    snprintf(out, 37,
             "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
             b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
             b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]);
}

static void random_ice_credentials(char ufrag[16], char pwd[40])
{
    /* RFC 5245 §7.1.2.3 — ufrag: 4+ chars, pwd: 22+ chars; both
     * drawn from the ICE-char alphabet. */
    static const char ice_chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                                    "abcdefghijklmnopqrstuvwxyz0123456789"
                                    "+/";
    uint8_t raw[24];
    sys_csrand_get(raw, sizeof(raw));

    for (int i = 0; i < 8; i++) {
        ufrag[i] = ice_chars[raw[i] % (sizeof(ice_chars) - 1)];
    }
    ufrag[8] = '\0';
    for (int i = 0; i < 24; i++) {
        pwd[i] = ice_chars[raw[i + 8] % (sizeof(ice_chars) - 1)];
    }
    pwd[24] = '\0';
}

static size_t build_sdp_offer(char *out, size_t cap, const char *ufrag,
                              const char *pwd)
{
    /* The DTLS fingerprint below is a placeholder. cortex forwards
     * the offer to temporal lobe, whose `WebRtcAnswerSkill`
     * (webrtc-rs) uses the fingerprint to negotiate DTLS. The real
     * fingerprint is generated when we ship a DTLS stack — for v1
     * any 32-byte hex string is enough to keep the wire parseable. */
    static const char fingerprint_sha256[] =
        "11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:"
        "11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00";

    return (size_t)snprintf(out, cap,
        "v=0\r\n"
        "o=- 1234567890 2 IN IP4 0.0.0.0\r\n"
        "s=-\r\n"
        "t=0 0\r\n"
        "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
        "c=IN IP4 0.0.0.0\r\n"
        "a=rtcp:9 IN IP4 0.0.0.0\r\n"
        "a=ice-ufrag:%s\r\n"
        "a=ice-pwd:%s\r\n"
        "a=fingerprint:sha-256 %s\r\n"
        "a=setup:actpass\r\n"
        "a=mid:0\r\n"
        "a=sendrecv\r\n"
        "a=rtcp-mux\r\n"
        "a=rtpmap:111 opus/48000/2\r\n"
        "a=fmtp:111 minptime=10;useinbandfec=1\r\n",
        ufrag, pwd, fingerprint_sha256);
}

static size_t build_offer_json(char *out, size_t cap, const char *session_id,
                                const char *sdp, const char *ufrag,
                                const char *pwd)
{
    /* cortex's `SignalingMessage::Offer` shape (serde):
     *   { "type": "offer", "session_id": "...", "modality": "voice", "sdp": "..." }
     *
     * We hand-craft the JSON to keep this translation unit free of
     * a JSON dependency until the dialog_task needs richer types
     * (DTLS config, ICE candidates list, etc.) — those land in
     * the follow-up commit. */
    return (size_t)snprintf(out, cap,
        "{\"type\":\"offer\","
        "\"session_id\":\"%s\","
        "\"modality\":\"%s\","
        "\"sdp\":\"%s\"}",
        session_id, CONFIG_SHADOW_MODALITY, sdp);
}

static int parse_session_id_field(const char *json, size_t len, char *out, size_t cap)
{
    /* Extract "session_id":"<uuid>" from a Connected message.
     * Naive but adequate for v1 — no full JSON parser. */
    static const char key[] = "\"session_id\":\"";
    const char *p = strstr(json, key);
    if (!p) {
        return -1;
    }
    p += sizeof(key) - 1;
    const char *end = strchr(p, '"');
    if (!end || (size_t)(end - p) >= cap) {
        return -1;
    }
    size_t n = (size_t)(end - p);
    memcpy(out, p, n);
    out[n] = '\0';
    return 0;
}

static void dialog_task_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);

    LOG_INF("dialog_task started; waiting for Wi-Fi");

    if (k_sem_take(&shadow_net_wifi_up, K_FOREVER) != 0) {
        LOG_ERR("wifi up semaphore take failed");
        return;
    }
    LOG_INF("Wi-Fi is up; opening signaling channel");

    char session_id[37];
    uuid_v4_string(session_id);
    LOG_INF("session_id=%s", session_id);

    char path[128];
    int n = snprintf(path, sizeof(path),
                     "/api/webrtc/%s/sessions/%s/ws",
                     CONFIG_SHADOW_MODALITY, session_id);
    if (n <= 0 || n >= (int)sizeof(path)) {
        LOG_ERR("path snprintf failed");
        return;
    }

    int ws = shadow_ws_connect(CONFIG_SHADOW_CORTEX_HOST,
                                CONFIG_SHADOW_CORTEX_PORT, path);
    if (ws < 0) {
        LOG_ERR("ws connect failed: %d", ws);
        return;
    }

    char ufrag[16], pwd[40];
    random_ice_credentials(ufrag, pwd);

    char sdp[1024];
    size_t sdp_len = build_sdp_offer(sdp, sizeof(sdp), ufrag, pwd);
    if (sdp_len == 0 || sdp_len >= sizeof(sdp)) {
        LOG_ERR("SDP build overflow");
        shadow_ws_close(ws);
        return;
    }

    char offer[2048];
    size_t offer_len = build_offer_json(offer, sizeof(offer), session_id,
                                         sdp, ufrag, pwd);
    if (offer_len == 0 || offer_len >= sizeof(offer)) {
        LOG_ERR("offer json overflow");
        shadow_ws_close(ws);
        return;
    }

    if (shadow_ws_send_text(ws, offer, offer_len) != SHADOW_WS_OK) {
        LOG_ERR("ws send offer failed");
        shadow_ws_close(ws);
        return;
    }
    LOG_INF("offer sent (%zu bytes)", offer_len);

    /* Read the cortex reply. We expect: Connected + Answer
     * (cortex forwards to temporal lobe and writes back the
     * Answer SDP). For v1, drain up to 4 KiB and log. */
    char buf[4096];
    int got = shadow_ws_recv_text(ws, buf, sizeof(buf) - 1);
    if (got < 0) {
        LOG_ERR("ws recv failed: %d", got);
        shadow_ws_close(ws);
        return;
    }
    if (got == 0) {
        LOG_WRN("ws closed before any answer");
        return;
    }
    buf[got] = '\0';
    LOG_INF("ws frame received (%d bytes): %s", got, buf);

    char echoed_id[40] = { 0 };
    if (parse_session_id_field(buf, got, echoed_id, sizeof(echoed_id)) == 0) {
        LOG_INF("cortex echoed session_id=%s", echoed_id);
    }

    /* Send Disconnected and close. */
    char bye[128];
    int bye_len = snprintf(bye, sizeof(bye),
                           "{\"type\":\"disconnected\","
                           "\"session_id\":\"%s\"}",
                           session_id);
    if (bye_len > 0) {
        shadow_ws_send_text(ws, bye, (size_t)bye_len);
    }
    shadow_ws_close(ws);

    /* ──────────────────────────────────────────────────────
     * v2.7 — DTLS PSK handshake + real SRTP key + STUN binding.
     *
     * Flow after signaling:
     *   1. Parse SDP answer → remote endpoint (host:port)
     *   2. Configure DTLS PSK (hardcoded demo key)
     *   3. Open UDP socket to remote endpoint
     *   4. DTLS handshake on UDP socket → 30-byte SRTP key
     *   5. ICE-lite: send STUN Binding Request
     *   6. Start audio pipeline
     *   7. Main loop: send mic → opus → SRTP → UDP;
     *      receive UDP → STUN/SRTP/data channel dispatch
     * ────────────────────────────────────────────────────── */

    /* Configure DTLS PSK (demo key — production comes from
     * NVS / provisioning). Both ESP32 and temporal lobe must
     * agree on this key byte-for-byte. */
    static const uint8_t dtls_psk[] = {
        0x73, 0x68, 0x61, 0x64, 0x6f, 0x77, 0x2d, 0x70,
        0x73, 0x6b, 0x2d, 0x32, 0x30, 0x32, 0x36, 0x00,
    };
    static const char dtls_psk_id[] = "shadow-esp32";
    shadow_dtls_set_psk(&(struct shadow_dtls_psk){
        .psk = dtls_psk, .psk_len = sizeof(dtls_psk),
        .psk_id = dtls_psk_id, .psk_id_len = strlen(dtls_psk_id),
    });

    /* Parse SDP answer to get remote endpoint (temporal lobe).
     * cortex forwards temporal lobe's SDP answer which contains:
     *   c=IN IP4 <remote_ip>
     *   m=audio <remote_port> ... */
    char remote_ip[64] = { 0 };
    uint16_t remote_port = 5006; /* default WebRTC media port */
    {
        const char *c_line = strstr(buf, "c=IN IP4 ");
        if (c_line) {
            const char *ip_start = c_line + 9;
            const char *ip_end = ip_start;
            while (*ip_end && *ip_end != '\r' && *ip_end != '\n' &&
                   (size_t)(ip_end - ip_start) < sizeof(remote_ip) - 1) {
                ip_end++;
            }
            size_t ip_len = (size_t)(ip_end - ip_start);
            memcpy(remote_ip, ip_start, ip_len);
            remote_ip[ip_len] = '\0';
        }
        const char *m_line = strstr(buf, "m=audio ");
        if (m_line) {
            const char *port_str = m_line + 8;
            remote_port = (uint16_t)atoi(port_str);
        }
        LOG_INF("SDP answer: remote=%s port=%u", remote_ip, remote_port);
    }

    if (strlen(remote_ip) == 0) {
        LOG_WRN("failed to parse SDP answer; using localhost");
        snprintf(remote_ip, sizeof(remote_ip), "127.0.0.1");
    }

    /* DTLS PSK handshake on UDP socket. */
    uint8_t srtp_master[SHADOW_SRTP_MASTER_BUF_LEN];
    int dtls_rc = shadow_dtls_handshake_udp(remote_ip, remote_port,
                                             srtp_master,
                                             sizeof(srtp_master));
    if (dtls_rc != 0) {
        LOG_ERR("dtls handshake failed: %d", dtls_rc);
        /* Fall back to static key. */
        static const uint8_t fallback[SHADOW_SRTP_MASTER_BUF_LEN] = {
            0xE1, 0xF9, 0x7A, 0x0D, 0x3E, 0x4B, 0xC9, 0x12,
            0xA1, 0xB4, 0xE0, 0x82, 0x5D, 0xFC, 0xD6, 0x4C,
            0x6E, 0x6B, 0x90, 0x49, 0x39, 0x25, 0x52, 0x3C,
            0x7A, 0x5F, 0xE7, 0x1A, 0x9D, 0x4A,
        };
        memcpy(srtp_master, fallback, SHADOW_SRTP_MASTER_BUF_LEN);
        LOG_WRN("using static SRTP key (DTLS fallback)");
    } else {
        LOG_INF("dtls handshake OK; real SRTP key derived");
    }

    /* Open UDP socket for SRTP + STUN + data channel. */
    LOG_INF("opening UDP socket to %s:%u", remote_ip, remote_port);
    int media_fd = zsock_socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (media_fd < 0) {
        LOG_ERR("udp socket open failed: %d", media_fd);
        return;
    }
    struct sockaddr_in remote_addr = { 0 };
    remote_addr.sin_family = AF_INET;
    zsock_inet_pton(AF_INET, remote_ip, &remote_addr.sin_addr);
    remote_addr.sin_port = htons(remote_port);

    /* ICE-lite: send STUN Binding Request to temporal lobe. */
    {
        uint8_t stun_req[20];
        uint8_t tx_id[12];
        sys_csrand_get(tx_id, sizeof(tx_id));
        stun_req[0] = 0x00; stun_req[1] = 0x01;
        stun_req[2] = 0x00; stun_req[3] = 0x00;
        stun_req[4] = 0x21; stun_req[5] = 0x12;
        stun_req[6] = 0xA4; stun_req[7] = 0x42;
        memcpy(stun_req + 8, tx_id, 12);
        zsock_sendto(media_fd, stun_req, 20, 0,
                     (struct sockaddr *)&remote_addr, sizeof(remote_addr));
        LOG_INF("STUN Binding Request sent to %s:%u", remote_ip, remote_port);
    }

    /* Start audio pipeline + create codec / SRTP sessions. */
    shadow_audio_pipeline_start();

    struct shadow_srtp_session *send_srtp =
        shadow_srtp_open(srtp_master, SHADOW_SRTP_MASTER_BUF_LEN);
    struct shadow_srtp_session *recv_srtp =
        shadow_srtp_open(srtp_master, SHADOW_SRTP_MASTER_BUF_LEN);
    struct shadow_opus_encoder *enc = shadow_opus_encoder_open();
    struct shadow_opus_decoder *dec = shadow_opus_decoder_open();

    if (send_srtp == NULL || recv_srtp == NULL ||
        enc == NULL || dec == NULL) {
        LOG_ERR("codec/srtp init failed");
        zsock_close(media_fd);
        shadow_audio_pipeline_stop();
        return;
    }

    /* ── Main media loop ────────────────────────────────── */
    LOG_INF("dialog_task entering media loop");
    int16_t pcm_in[SHADOW_OPUS_FRAME_SAMPLES];
    uint8_t opus_buf[SHADOW_OPUS_MAX_PACKET];
    uint8_t srtp_buf[SHADOW_OPUS_MAX_PACKET + 64];
    uint8_t recv_buf[1500];

    static atomic_t dialog_running = ATOMIC_INIT(1);

    while (atomic_get(&dialog_running)) {
        /* --- SEND: mic → opus → SRTP → UDP --- */
        int rc_pcm = shadow_audio_pipeline_read_pcm(pcm_in);
        if (rc_pcm == 0) {
            int n_opus = shadow_opus_encoder_encode(enc, pcm_in,
                                                     opus_buf,
                                                     sizeof(opus_buf));
            if (n_opus > 0) {
                int n_srtp = shadow_srtp_protect(send_srtp,
                                                   srtp_buf,
                                                   sizeof(srtp_buf),
                                                   opus_buf,
                                                   (size_t)n_opus);
                if (n_srtp > 0) {
                    zsock_sendto(media_fd, srtp_buf, (size_t)n_srtp, 0,
                                 (struct sockaddr *)&remote_addr,
                                 sizeof(remote_addr));
                }
            }
        }

        /* --- RECV: recvfrom + STUN/SRTP/data channel dispatch --- */
        struct sockaddr_in from;
        socklen_t fromlen = sizeof(from);
        ssize_t n = zsock_recvfrom(media_fd, recv_buf, sizeof(recv_buf),
                                    MSG_DONTWAIT,
                                    (struct sockaddr *)&from, &fromlen);
        if (n > 0) {
            /* STUN binding request from temporal lobe? */
            uint8_t tx_id[12];
            if (shadow_stun_parse_binding_request(recv_buf, (size_t)n,
                                                    tx_id) == 0) {
                uint8_t stun_resp[64];
                size_t resp_len = shadow_stun_build_binding_response(
                    tx_id, from.sin_addr.s_addr, from.sin_port,
                    stun_resp, sizeof(stun_resp));
                if (resp_len > 0) {
                    zsock_sendto(media_fd, stun_resp, resp_len, 0,
                                 (struct sockaddr *)&from, fromlen);
                }
                continue;
            }
            /* SRTP-protected opus packet? */
            if ((size_t)n > 12) {
                uint8_t plain[1500];
                int r_dec = shadow_srtp_unprotect(recv_srtp, plain,
                                                    sizeof(plain),
                                                    recv_buf, (size_t)n);
                if (r_dec > 0) {
                    int n_dec = shadow_opus_decoder_decode(dec, plain,
                                                            (size_t)r_dec,
                                                            NULL, 0);
                    LOG_DBG("opus decode: %d samples", n_dec);
                    continue;
                }
            }
            /* Fallback: raw JSON-RPC (data channel stand-in). */
            char json_in[1500 + 1];
            size_t clen = (size_t)n < sizeof(json_in) - 1
                          ? (size_t)n : sizeof(json_in) - 1;
            memcpy(json_in, recv_buf, clen);
            json_in[clen] = '\0';
            char json_out[256];
            size_t out_len = shadow_io_invoke_mcp(json_in, json_out,
                                                  sizeof(json_out));
            if (out_len > 0) {
                zsock_sendto(media_fd, json_out, out_len, 0,
                             (struct sockaddr *)&from, fromlen);
            }
        }
        k_sleep(K_MSEC(10));
    }

    /* Cleanup. */
    zsock_close(media_fd);
    shadow_opus_decoder_close(dec);
    shadow_opus_encoder_close(enc);
    shadow_srtp_close(send_srtp);
    shadow_srtp_close(recv_srtp);
    shadow_audio_pipeline_stop();

    LOG_INF("dialog_task media loop ended; idle");
}

void shadow_dialog_task_start(void)
{
    k_thread_create(&dialog_thread, dialog_stack,
                    K_THREAD_STACK_SIZEOF(dialog_stack),
                    dialog_task_fn, NULL, NULL, NULL,
                    SHADOW_DIALOG_PRIORITY, 0, K_NO_WAIT);
    k_thread_name_set(&dialog_thread, "dialog");
}
