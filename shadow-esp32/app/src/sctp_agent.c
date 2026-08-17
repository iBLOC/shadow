/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §后续动作 #4a.8 — WebRTC DataChannel payload
 * format. v1 only handles the byte-level framing; a follow-up
 * commit hooks the libusrsctp SCTP association in. The format
 * here matches the IETF WebRTC DataChannel encapsulation for a
 * single in-order reliable message: 2-byte big-endian length
 * followed by a UTF-8 JSON body. The receiving side does the
 * inverse.
 */

#include <string.h>

#include <shadow_esp32/sctp_agent.h>

int shadow_sctp_pack_json(const char *json, size_t json_len,
                            uint8_t *out, size_t out_cap,
                            size_t *out_len)
{
    if (json == NULL || out == NULL || out_len == NULL) {
        return -1;
    }
    if (json_len > SHADOW_SCTP_MAX_FRAME) {
        return -1;
    }
    if (out_cap < json_len + 2) {
        return -1;
    }
    /* 2-byte big-endian length prefix. */
    out[0] = (uint8_t)((json_len >> 8) & 0xFF);
    out[1] = (uint8_t)(json_len & 0xFF);
    memcpy(out + 2, json, json_len);
    *out_len = json_len + 2;
    return 0;
}

int shadow_sctp_unpack_json(const uint8_t *in, size_t in_len,
                              char *out, size_t out_cap,
                              size_t *out_len)
{
    if (in == NULL || out == NULL || out_len == NULL) {
        return -1;
    }
    if (in_len < 2) {
        return -1;
    }
    size_t payload_len = ((size_t)in[0] << 8) | (size_t)in[1];
    if (payload_len + 2 != in_len) {
        return -1;
    }
    if (payload_len + 1 > out_cap) {
        return -1;
    }
    memcpy(out, in + 2, payload_len);
    out[payload_len] = '\0';
    *out_len = payload_len;
    return 0;
}