/* SPDX-License-Identifier: Apache-2.0 */

/* Minimal RFC 6455 WebSocket client. v1 supports text frames only
 * (the dialog_task only needs text frames to carry
 * `SignalingMessage` JSON between the device and cortex). Pings
 * are answered with pongs; everything else is best-effort.
 *
 * Out of scope (follow-up commits):
 *   - TLS (`wss://`) — needs an mbedtls client profile
 *   - Fragmented frames — current code rejects FIN=0
 *   - Pong scheduling — we reply inline during recv_text
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/net/socket.h>
#include <zephyr/net/net_ip.h>
#include <zephyr/random/random.h>

#include <string.h>
#include <ctype.h>

#include <shadow_esp32/ws_client.h>

LOG_MODULE_REGISTER(shadow_ws, CONFIG_SHADOW_ESP32_LOG_LEVEL);

#define WS_GUID "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

static const char b64_alphabet[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static size_t b64_encode(char *out, const uint8_t *in, size_t in_len)
{
    size_t i, o = 0;

    for (i = 0; i + 2 < in_len; i += 3) {
        out[o++] = b64_alphabet[(in[i] >> 2) & 0x3f];
        out[o++] = b64_alphabet[((in[i] << 4) | (in[i + 1] >> 4)) & 0x3f];
        out[o++] = b64_alphabet[((in[i + 1] << 2) | (in[i + 2] >> 6)) & 0x3f];
        out[o++] = b64_alphabet[in[i + 2] & 0x3f];
    }
    if (i < in_len) {
        out[o++] = b64_alphabet[(in[i] >> 2) & 0x3f];
        if (i + 1 < in_len) {
            out[o++] = b64_alphabet[((in[i] << 4) | (in[i + 1] >> 4)) & 0x3f];
            out[o++] = b64_alphabet[(in[i + 1] << 2) & 0x3f];
            out[o++] = '=';
        } else {
            out[o++] = b64_alphabet[(in[i] << 4) & 0x3f];
            out[o++] = '=';
            out[o++] = '=';
        }
    }
    return o;
}

static int dns_resolve_v4(const char *host, struct sockaddr_in *out)
{
    struct addrinfo hints = {
        .ai_family = AF_INET,
        .ai_socktype = SOCK_STREAM,
    };
    struct addrinfo *res = NULL;

    int rc = getaddrinfo(host, NULL, &hints, &res);
    if (rc != 0 || res == NULL) {
        return -1;
    }
    memcpy(out, res->ai_addr, sizeof(*out));
    freeaddrinfo(res);
    return 0;
}

static int tcp_connect(const char *host, uint16_t port)
{
    struct sockaddr_in addr;

    if (dns_resolve_v4(host, &addr) != 0) {
        LOG_WRN("dns resolve %s failed", host);
        return SHADOW_WS_ERR_RESOLVE;
    }
    addr.sin_port = htons(port);

    int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (fd < 0) {
        return SHADOW_WS_ERR_SOCKET;
    }

    int rc = connect(fd, (struct sockaddr *)&addr, sizeof(addr));
    if (rc < 0) {
        close(fd);
        return SHADOW_WS_ERR_CONNECT;
    }
    return fd;
}

/* Minimal HTTP/1.1 response parser — looks only for "101" status
 * line; consumes headers until blank line. Returns 0 on 101,
 * -1 otherwise. */
static int parse_handshake_response(int fd, char *scratch, size_t cap)
{
    size_t total = 0;
    size_t header_end = 0;
    bool saw_101 = false;

    while (total < cap) {
        ssize_t n = recv(fd, scratch + total, cap - total, 0);
        if (n <= 0) {
            return -1;
        }
        total += n;

        /* Find CRLFCRLF marking end of headers. */
        for (size_t i = 0; i + 3 < total; i++) {
            if (scratch[i] == '\r' && scratch[i + 1] == '\n' &&
                scratch[i + 2] == '\r' && scratch[i + 3] == '\n') {
                header_end = i + 4;
                break;
            }
        }
        if (header_end != 0) {
            break;
        }
    }
    if (header_end == 0) {
        return -1;
    }

    /* Check status line starts with "HTTP/1.1 101". */
    if (total < 12 ||
        memcmp(scratch, "HTTP/1.1 101", 12) != 0) {
        return -1;
    }
    saw_101 = true;

    /* Strip consumed bytes from the socket buffer by reading the
     * rest (anything after the header block — likely empty for a
     * websocket upgrade) is data we discard. */
    if (header_end < total) {
        /* Drain — easiest is to issue a recv with MSG_PEEK-style
         * of any remainder. We don't have a buffer here, so just
         * let the next recv_text pick it up via the kernel. */
    }
    return saw_101 ? 0 : -1;
}

int shadow_ws_connect(const char *host, uint16_t port, const char *path)
{
    int fd = tcp_connect(host, port);
    if (fd < 0) {
        return fd;
    }

    /* RFC 6455 §1.3 — client key is 16 random bytes, base64-encoded. */
    uint8_t key_raw[16];
    sys_csrand_get(key_raw, sizeof(key_raw));
    char key_b64[32];
    size_t key_len = b64_encode(key_b64, key_raw, sizeof(key_raw));
    key_b64[key_len] = '\0';

    char req[512];
    int n = snprintf(req, sizeof(req),
                     "GET %s HTTP/1.1\r\n"
                     "Host: %s:%u\r\n"
                     "Upgrade: websocket\r\n"
                     "Connection: Upgrade\r\n"
                     "Sec-WebSocket-Key: %s\r\n"
                     "Sec-WebSocket-Version: 13\r\n"
                     "\r\n",
                     path, host, port, key_b64);
    if (n <= 0 || n >= (int)sizeof(req)) {
        close(fd);
        return SHADOW_WS_ERR_HANDSHAKE;
    }

    ssize_t sent = send(fd, req, n, 0);
    if (sent != n) {
        close(fd);
        return SHADOW_WS_ERR_HANDSHAKE;
    }

    char scratch[1024];
    if (parse_handshake_response(fd, scratch, sizeof(scratch)) != 0) {
        close(fd);
        return SHADOW_WS_ERR_HANDSHAKE;
    }

    LOG_INF("ws handshake ok: fd=%d host=%s path=%s", fd, host, path);
    return fd;
}

/* Build one masked client frame (FIN=1, opcode=0x1) and write it.
 * Returns 0 on success, negative on I. */
static int write_masked_text_frame(int fd, const uint8_t *payload, size_t len)
{
    if (len > 0xFFFF) {
        return SHADOW_WS_ERR_FRAME;
    }

    uint8_t header[14];
    size_t header_len = 0;
    header[header_len++] = 0x81; /* FIN=1, opcode=1 (text) */
    if (len < 126) {
        header[header_len++] = 0x80 | (uint8_t)len;
    } else {
        header[header_len++] = 0x80 | 126;
        header[header_len++] = (uint8_t)(len >> 8);
        header[header_len++] = (uint8_t)(len & 0xFF);
    }
    uint8_t mask[4];
    sys_csrand_get(mask, sizeof(mask));
    memcpy(&header[header_len], mask, sizeof(mask));
    header_len += sizeof(mask);

    if (send(fd, header, header_len, 0) != (ssize_t)header_len) {
        return SHADOW_WS_ERR_FRAME;
    }

    /* Send payload XOR-masked in 4-byte chunks. */
    uint8_t buf[256];
    size_t off = 0;
    while (off < len) {
        size_t chunk = MIN(sizeof(buf) - sizeof(mask), len - off);
        memcpy(buf, payload + off, chunk);
        for (size_t i = 0; i < chunk; i++) {
            buf[i] ^= mask[i & 3];
        }
        ssize_t s = send(fd, buf, chunk, 0);
        if (s != (ssize_t)chunk) {
            return SHADOW_WS_ERR_FRAME;
        }
        off += chunk;
    }
    return SHADOW_WS_OK;
}

int shadow_ws_send_text(int fd, const char *payload, size_t len)
{
    return write_masked_text_frame(fd, (const uint8_t *)payload, len);
}

/* Read one frame header + payload. Returns the number of payload
 * bytes written into buf, 0 on close, negative on error. */
static int read_one_frame(int fd, char *buf, size_t cap)
{
    uint8_t hdr[2];
    int got = 0;
    while (got < 2) {
        ssize_t n = recv(fd, hdr + got, 2 - got, 0);
        if (n <= 0) {
            return (n == 0) ? 0 : SHADOW_WS_ERR_FRAME;
        }
        got += n;
    }

    bool fin = (hdr[0] & 0x80) != 0;
    uint8_t opcode = hdr[0] & 0x0F;
    bool masked = (hdr[1] & 0x80) != 0;
    uint64_t plen = hdr[1] & 0x7F;

    if (!fin) {
        LOG_WRN("fragmented ws frame unsupported");
        return SHADOW_WS_ERR_FRAME;
    }
    if (masked) {
        LOG_WRN("masked frame from server (RFC violation)");
        return SHADOW_WS_ERR_FRAME;
    }
    if (plen == 126) {
        uint8_t ext[2];
        got = 0;
        while (got < 2) {
            ssize_t n = recv(fd, ext + got, 2 - got, 0);
            if (n <= 0) {
                return SHADOW_WS_ERR_FRAME;
            }
            got += n;
        }
        plen = ((uint64_t)ext[0] << 8) | ext[1];
    } else if (plen == 127) {
        uint8_t ext[8];
        got = 0;
        while (got < 8) {
            ssize_t n = recv(fd, ext + got, 8 - got, 0);
            if (n <= 0) {
                return SHADOW_WS_ERR_FRAME;
            }
            got += n;
        }
        plen = ((uint64_t)ext[0] << 56) | ((uint64_t)ext[1] << 48) |
               ((uint64_t)ext[2] << 40) | ((uint64_t)ext[3] << 32) |
               ((uint64_t)ext[4] << 24) | ((uint64_t)ext[5] << 16) |
               ((uint64_t)ext[6] <<  8) | ((uint64_t)ext[7]);
    }

    if (plen > cap) {
        LOG_WRN("ws payload %llu > cap %zu", (unsigned long long)plen, cap);
        return SHADOW_WS_ERR_FRAME;
    }

    if (opcode == 0x8) {
        /* close */
        return 0;
    }
    if (opcode == 0x9) {
        /* ping -> reply pong */
        uint8_t pong[2] = { 0x8A, 0 }; /* FIN=1, opcode=0xA, len=0 */
        send(fd, pong, sizeof(pong), MSG_DONTWAIT);
        return read_one_frame(fd, buf, cap); /* tail-call next frame */
    }
    if (opcode != 0x1 && opcode != 0x2) {
        LOG_WRN("unsupported ws opcode 0x%x", opcode);
        return SHADOW_WS_ERR_FRAME;
    }

    size_t got_payload = 0;
    while (got_payload < plen) {
        ssize_t n = recv(fd, buf + got_payload, plen - got_payload, 0);
        if (n <= 0) {
            return SHADOW_WS_ERR_FRAME;
        }
        got_payload += n;
    }
    return (int)got_payload;
}

int shadow_ws_recv_text(int fd, char *buf, size_t cap)
{
    int rc = read_one_frame(fd, buf, cap);
    if (rc < 0) {
        return rc;
    }
    if (rc == 0) {
        return 0; /* close */
    }
    /* read_one_frame skips control frames internally; rc > 0 is
     * a text/binary payload. We only return text content here, so
     * for binary frames we just return the byte count. */
    return rc;
}

void shadow_ws_close(int fd)
{
    if (fd < 0) {
        return;
    }
    uint8_t close_frame[4] = { 0x88, 0x02, 0x03, 0xE8 }; /* FIN + close + 1000 */
    send(fd, close_frame, sizeof(close_frame), MSG_DONTWAIT);
    shutdown(fd, SHUT_RDWR);
    close(fd);
}