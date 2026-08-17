/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_SRTP_H
#define SHADOW_ESP32_SRTP_H

#include <stddef.h>
#include <stdint.h>

/* Opaque session handle. Backed by libsrtp. */
struct shadow_srtp_session;

/* A "master key + salt" pair is the canonical libsrtp keying
 * material. For AES-128-CM-HMAC-SHA1-80 (the WebRTC default and
 * libsrtp's compiled-in default), the master key is 16 bytes
 * and the master salt is 14 bytes. The on-wire WebRTC DTLS-SRTP
 * negotiation exchanges exactly this 30-byte buffer; we keep
 * the same layout here so the byte stream produced by the DTLS
 * code can be passed straight into this API.
 *
 *   key[0..15]   master key
 *   key[16..29]  master salt
 */
#define SHADOW_SRTP_MASTER_KEY_LEN   16
#define SHADOW_SRTP_MASTER_SALT_LEN  14
#define SHADOW_SRTP_MASTER_BUF_LEN   (SHADOW_SRTP_MASTER_KEY_LEN + SHADOW_SRTP_MASTER_SALT_LEN)

/* Open an SRTP session that can both send and receive. The same
 * master key + salt is registered for both directions — for our
 * point-to-point WebRTC peer link that is enough. Returns NULL on
 * failure (e.g., libsrtp init failed). */
struct shadow_srtp_session *shadow_srtp_open(const uint8_t *master,
                                              size_t master_len);

/* Protect (encrypt + authenticate) an RTP packet. `in` is the
 * plaintext RTP payload (header + payload, no padding). The
 * encrypted packet is written to `out`; `out_cap` must be at
 * least `in_len + SRTP_MAX_TRAILER_LEN` (libsrtp adds up to 14
 * bytes of auth tag). Returns the encrypted byte count, or a
 * negative libsrtp error code. */
int shadow_srtp_protect(struct shadow_srtp_session *s,
                        uint8_t *out, size_t out_cap,
                        const uint8_t *in, size_t in_len);

/* Unprotect (verify + decrypt) an SRTP packet back into RTP.
 * Inverse of `shadow_srtp_protect`. Returns the recovered byte
 * count, or a negative libsrtp error code. */
int shadow_srtp_unprotect(struct shadow_srtp_session *s,
                          uint8_t *out, size_t out_cap,
                          const uint8_t *in, size_t in_len);

void shadow_srtp_close(struct shadow_srtp_session *s);

#endif /* SHADOW_ESP32_SRTP_H */