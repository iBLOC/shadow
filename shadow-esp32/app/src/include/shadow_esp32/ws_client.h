/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_WS_CLIENT_H
#define SHADOW_ESP32_WS_CLIENT_H

#include <stddef.h>
#include <stdint.h>

/* Result codes returned by the WebSocket client. */
enum shadow_ws_result {
    SHADOW_WS_OK = 0,
    SHADOW_WS_ERR_RESOLVE = -1,
    SHADOW_WS_ERR_SOCKET = -2,
    SHADOW_WS_ERR_CONNECT = -3,
    SHADOW_WS_ERR_HANDSHAKE = -4,
    SHADOW_WS_ERR_FRAME = -5,
};

/*
 * Establish a WebSocket client connection to `host:port` and
 * exchange the RFC 6455 opening handshake on `path`. Blocks until
 * the handshake completes or an error occurs; on success the
 * returned integer is the connected socket fd (caller owns it).
 */
int shadow_ws_connect(const char *host, uint16_t port, const char *path);

/*
 * Send a single masked text frame to the connected peer.
 * Returns SHADOW_WS_OK on success or a shadow_ws_result error code.
 */
int shadow_ws_send_text(int fd, const char *payload, size_t len);

/*
 * Receive a single text frame from the connected peer into `buf`
 * (capacity `cap`). Pings (opcode 0x9) are answered with pongs
 * internally; control frames of other types are ignored.
 * Returns the number of bytes written into `buf` on success,
 * 0 on graceful close, or a negative shadow_ws_result code on
 * error.
 */
int shadow_ws_recv_text(int fd, char *buf, size_t cap);

/*
 * Send a WebSocket close frame (status 1000 = normal closure)
 * and shut down the TCP socket.
 */
void shadow_ws_close(int fd);

#endif /* SHADOW_ESP32_WS_CLIENT_H */