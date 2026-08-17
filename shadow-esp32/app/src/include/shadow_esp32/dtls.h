/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_DTLS_H
#define SHADOW_ESP32_DTLS_H

#include <stddef.h>
#include <stdint.h>

/* DTLS handshake (RFC 6347) lives on the media plane between
 * shadow-esp32 and the temporal lobe. The handshake output is
 * the 30-byte master key + salt that AES-128-CM-HMAC-SHA1-80
 * (RFC 5764 §4.2) derives from the DTLS exporter.
 *
 * v1 uses DTLS-PSK (pre-shared key) mode — the client and
 * server share a secret out of band (config or hard-coded for
 * the smoke test). Certificate-based DTLS is future work.
 */

/* Maximum number of bytes needed for a master_key + master_salt
 * pair. AES-128-CM-HMAC-SHA1-80 uses 16-byte master_key +
 * 14-byte master_salt = 30 bytes. */
#define SHADOW_DTLS_MASTER_BUF_LEN  30

/* Configure a fixed PSK + PSK identity. Both sides must agree
 * byte-for-byte on these. */
struct shadow_dtls_psk {
    const uint8_t *psk;       /* shared secret bytes */
    size_t psk_len;
    const char    *psk_id;    /* identity hint, ASCII */
    size_t        psk_id_len;
};

int shadow_dtls_set_psk(const struct shadow_dtls_psk *psk);

/* Run the DTLS handshake over a UDP socket pair. Blocks until
 * the handshake completes (success or fatal error). On success,
 * `out_master_buf` receives the 30-byte master key + salt that
 * the SRTP module will hand to `shadow_srtp_open`.
 *
 * `sock` is the connected UDP socket used to carry the DTLS
 * record layer (the WebRTC PeerConnection's "media" path; on
 * the device side this is the same UDP socket the SRTP sender
 * will use). The peer address is implicit in the socket. */
int shadow_dtls_handshake(int sock, uint8_t *out_master_buf,
                           size_t out_master_cap);

/* Convenience: derive the AES-128-CM-HMAC-SHA1-80 master key
 * + salt from the DTLS exporter labels (RFC 5764 §4.2). Used
 * to populate `shadow_srtp_open` after a successful handshake. */
int shadow_dtls_derive_srtp_master(const uint8_t *dtls_master_secret,
                                     size_t len,
                                     uint8_t *out_master,
                                     size_t out_master_cap);

#endif /* SHADOW_ESP32_DTLS_H */