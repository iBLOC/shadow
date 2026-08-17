/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_STUN_H
#define SHADOW_ESP32_STUN_H

#include <stddef.h>
#include <stdint.h>

/* Minimal STUN (RFC 5389) responder. The shadow-esp32 ICE-lite
 * peer answers STUN Binding Requests that the controlling agent
 * (temporal lobe) sends to confirm candidate reachability. v1
 * implements only the two attributes we need: XOR-MAPPED-ADDRESS
 * (response carries the device's own address) and FINGERPRINT
 * (CRC-32 over the STUN message up to the FINGERPRINT attribute).
 */

#define SHADOW_STUN_MAGIC_COOKIE 0x2112A442u

struct shadow_stun_msg {
    uint16_t type;     /* Binding Request=0x0001, Response=0x0101 */
    uint16_t length;   /* bytes after header, excludes 20-byte hdr */
    uint32_t magic;    /* always 0x2112A442 */
    uint8_t  tx_id[12];
};

/* Returns 0 if `buf` looks like a valid STUN Binding Request,
 * negative on any error. The tx_id is copied into `out_tx_id`
 * for use in the response. */
int shadow_stun_parse_binding_request(const uint8_t *buf, size_t len,
                                       uint8_t out_tx_id[12]);

/* Build a STUN Binding Success Response that mirrors the
 * request's tx_id. The XOR-MAPPED-ADDRESS attribute points to
 * `xmit_addr` / `xmit_port` (the local socket that received the
 * request). The output buffer receives the encoded message; the
 * caller is expected to send it back on the same UDP socket. */
size_t shadow_stun_build_binding_response(
    const uint8_t tx_id[12],
    uint32_t xmit_addr,   /* network byte order */
    uint16_t xmit_port,
    uint8_t *out, size_t out_cap);

#endif /* SHADOW_ESP32_STUN_H */