/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §后续动作 #4a.7 follow-up — STUN Binding responder.
 *
 * v1 implements the two attributes a STUN Binding Response
 * needs to be valid (RFC 5389 §6):
 *   - XOR-MAPPED-ADDRESS (0x0001)
 *   - FINGERPRINT       (0x8028, CRC-32 over the message up
 *                        to but not including the FINGERPRINT
 *                        attribute itself, XORed with 0x5354554e)
 *
 * The function is the bare STUN byte format; it does not open a
 * socket. dialog_task owns the UDP socket and calls
 * `shadow_stun_parse_binding_request` on every received
 * datagram; on a hit it builds a response with
 * `shadow_stun_build_binding_response` and sends it back.
 */

#include <zephyr/kernel.h>

#include <string.h>

#include <shadow_esp32/stun.h>

#define STUN_BINDING_REQUEST  0x0001
#define STUN_BINDING_RESPONSE  0x0101
#define STUN_ATTR_MAPPED_ADDR  0x0001
#define STUN_ATTR_FINGERPRINT   0x8028
#define STUN_HEADER_LEN         20
#define STUN_FINGERPRINT_XOR    0x5354554eu

static uint32_t crc32_table[256];
static bool     crc32_table_built;
static struct k_mutex crc32_table_lock;

static void build_crc32_table(void)
{
    if (crc32_table_built) {
        return;
    }
    for (uint32_t i = 0; i < 256; i++) {
        uint32_t c = i;
        for (int j = 0; j < 8; j++) {
            c = (c & 1) ? (0xedb88320u ^ (c >> 1)) : (c >> 1);
        }
        crc32_table[i] = c;
    }
    crc32_table_built = true;
}

static uint32_t stun_crc32(const uint8_t *buf, size_t len)
{
    k_mutex_lock(&crc32_table_lock, K_FOREVER);
    build_crc32_table();
    uint32_t c = 0xFFFFFFFFu;
    for (size_t i = 0; i < len; i++) {
        c = crc32_table[(c ^ buf[i]) & 0xFF] ^ (c >> 8);
    }
    k_mutex_unlock(&crc32_table_lock);
    return c ^ 0xFFFFFFFFu;
}

int shadow_stun_parse_binding_request(const uint8_t *buf, size_t len,
                                       uint8_t out_tx_id[12])
{
    if (buf == NULL || len < STUN_HEADER_LEN || out_tx_id == NULL) {
        return -1;
    }
    uint16_t type  = ((uint16_t)buf[0] << 8) | buf[1];
    uint16_t mlen  = ((uint16_t)buf[2] << 8) | buf[3];
    uint32_t magic = ((uint32_t)buf[4] << 24) | ((uint32_t)buf[5] << 16) |
                     ((uint32_t)buf[6] << 8)  |  (uint32_t)buf[7];
    if (type != STUN_BINDING_REQUEST) {
        return -1;
    }
    if (magic != SHADOW_STUN_MAGIC_COOKIE) {
        return -1;
    }
    if ((size_t)mlen + STUN_HEADER_LEN > len) {
        return -1;
    }
    memcpy(out_tx_id, buf + 8, 12);
    return 0;
}

static void put_be16(uint8_t *p, uint16_t v)
{
    p[0] = (uint8_t)(v >> 8);
    p[1] = (uint8_t)(v & 0xFF);
}

static void put_be32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)(v >> 24);
    p[1] = (uint8_t)(v >> 16);
    p[2] = (uint8_t)(v >> 8);
    p[3] = (uint8_t)(v & 0xFF);
}

/* Build the response in a two-pass manner: first write header +
 * XOR-MAPPED-ADDRESS (body[0..13]), compute the CRC over that
 * prefix, then append the FINGERPRINT attribute at body[13..21]. */
size_t shadow_stun_build_binding_response(
    const uint8_t tx_id[12],
    uint32_t xmit_addr,
    uint16_t xmit_port,
    uint8_t *out, size_t out_cap)
{
    if (tx_id == NULL || out == NULL) {
        return 0;
    }
    if (out_cap < STUN_HEADER_LEN + 13 + 8) {
        return 0;
    }

    /* Header (20 bytes). */
    put_be16(&out[0], STUN_BINDING_RESPONSE);
    put_be16(&out[2], 13 + 8); /* XOR-MAPPED-ADDRESS + FINGERPRINT */
    put_be32(&out[4], SHADOW_STUN_MAGIC_COOKIE);
    memcpy(&out[8], tx_id, 12);

    /* XOR-MAPPED-ADDRESS (13 bytes): family=IPv4, X-port, X-addr. */
    put_be16(&out[20], STUN_ATTR_MAPPED_ADDR);
    put_be16(&out[22], 8);
    out[24] = 0x00; out[25] = 0x00; /* reserved */
    out[26] = 0x01; /* family IPv4 */
    uint16_t xport = xmit_port ^ (uint16_t)(SHADOW_STUN_MAGIC_COOKIE >> 16);
    out[27] = (uint8_t)(xport >> 8);
    out[28] = (uint8_t)(xport & 0xFF);
    uint32_t xaddr = xmit_addr ^ SHADOW_STUN_MAGIC_COOKIE;
    put_be32(&out[29], xaddr);

    /* FINGERPRINT (8 bytes): CRC-32 over header + XOR-MAPPED, XORed
     * with 0x5354554e. */
    uint32_t crc = stun_crc32(out, STUN_HEADER_LEN + 13);
    crc ^= STUN_FINGERPRINT_XOR;
    put_be16(&out[33], STUN_ATTR_FINGERPRINT);
    put_be16(&out[35], 4);
    put_be32(&out[37], crc);

    return STUN_HEADER_LEN + 13 + 8;
}