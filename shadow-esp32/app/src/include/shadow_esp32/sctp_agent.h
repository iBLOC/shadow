/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_SCTP_AGENT_H
#define SHADOW_ESP32_SCTP_AGENT_H

#include <stddef.h>
#include <stdint.h>

/* SCTP-over-DTLS data channel (RFC 8261 + WebRTC DataChannel
 * Protocol) for shadow-esp32.
 *
 * The data channel carries JSON-RPC 2.0 frames between the
 * device and telencephalon::mcp::device_router. v1 of this module
 * implements the **on-the-wire format** but defers the actual
 * SCTP/UDP transport to a follow-up commit. The dialog_task
 * can call `shadow_sctp_pack` / `shadow_sctp_unpack` to format
 * and parse the JSON-RPC payloads it wants to ship, then hand
 * the byte stream to whatever transport is in place (a raw
 * UDP socket for v1.1, an actual SCTP association for v1.2).
 *
 * v1 framing matches the IETF WebRTC data channel encapsulation
 * for a single in-order reliable message: a 2-byte length
 * prefix followed by a UTF-8 JSON body.
 */

#define SHADOW_SCTP_MAX_FRAME 4000

int shadow_sctp_pack_json(const char *json, size_t json_len,
                            uint8_t *out, size_t out_cap,
                            size_t *out_len);

int shadow_sctp_unpack_json(const uint8_t *in, size_t in_len,
                              char *out, size_t out_cap,
                              size_t *out_len);

#endif /* SHADOW_ESP32_SCTP_AGENT_H */