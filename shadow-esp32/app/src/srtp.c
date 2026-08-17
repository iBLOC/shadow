/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §后续动作 #4a.2 — thin shadow-esp32 wrapper around
 * libsrtp v2.7.0. The library lives in `app/srtp/libsrtp/` after
 * `west update` runs; this translation unit only references the
 * upstream `<srtp2/srtp.h>` API.
 *
 * v1 sets up a single bidirectional SRTP session — the master key
 * + salt pair is registered for both `ssrc_any_outbound` (our
 * encoder) and `ssrc_any_inbound` (our decoder). The WebRTC
 * peer side (temporal lobe) hands us the same 30-byte key buffer
 * over DTLS, so this module just consumes it.
 *
 * v1.1 of this wrapper hardcodes AES-128-CM-HMAC-SHA1-80, the
 * WebRTC default. AES-256-CM and AES-GCM are future work and
 * follow the same pattern — they only need `crypto_policy_set_*`
 * overrides plus the matching `libsrtp` build option.
 */

#include "srtp2/srtp.h"

#include <stdlib.h>
#include <string.h>

#include <shadow_esp32/srtp.h>

struct shadow_srtp_session {
    srtp_t srtp;
    uint8_t key[SHADOW_SRTP_MASTER_BUF_LEN];
};

static int add_direction(srtp_t srtp, const uint8_t *key,
                          ssrc_type_t direction)
{
    srtp_policy_t policy;
    memset(&policy, 0, sizeof(policy));

    /* AES-128-CM-HMAC-SHA1-80 — libsrtp's compiled-in default. */
    srtp_crypto_policy_set_rtp_default(&policy.rtp);
    srtp_crypto_policy_set_rtcp_default(&policy.rtcp);

    policy.ssrc.type = direction;
    policy.ssrc.value = 0;
    policy.key       = key;
    policy.next      = NULL;

    /* libsrtp returns srtp_err_status_ok on success and one of
     * the srtp_err_status_t error codes on failure; we forward
     * the raw value (negative on error) so the caller can log. */
    return srtp_add_stream(srtp, &policy);
}

struct shadow_srtp_session *shadow_srtp_open(const uint8_t *master,
                                              size_t master_len)
{
    if (master == NULL || master_len != SHADOW_SRTP_MASTER_BUF_LEN) {
        return NULL;
    }

    if (srtp_init() != srtp_err_status_ok) {
        return NULL;
    }

    struct shadow_srtp_session *s = malloc(sizeof(*s));
    if (s == NULL) {
        return NULL;
    }
    memcpy(s->key, master, SHADOW_SRTP_MASTER_BUF_LEN);

    srtp_policy_t policy;
    memset(&policy, 0, sizeof(policy));
    if (srtp_create(&s->srtp, &policy) != srtp_err_status_ok) {
        free(s);
        return NULL;
    }

    if (add_direction(s->srtp, s->key, ssrc_any_outbound) != srtp_err_status_ok) {
        srtp_dealloc(s->srtp);
        free(s);
        return NULL;
    }
    if (add_direction(s->srtp, s->key, ssrc_any_inbound) != srtp_err_status_ok) {
        srtp_dealloc(s->srtp);
        free(s);
        return NULL;
    }
    return s;
}

int shadow_srtp_protect(struct shadow_srtp_session *s,
                        uint8_t *out, size_t out_cap,
                        const uint8_t *in, size_t in_len)
{
    if (s == NULL || out == NULL || in == NULL) {
        return -1;
    }
    /* libsrtp returns the output length, or a negative
     * srtp_err_status_t on failure. */
    int r = srtp_protect(s->srtp, out, in, (size_t)in_len, out_cap);
    return r;
}

int shadow_srtp_unprotect(struct shadow_srtp_session *s,
                          uint8_t *out, size_t out_cap,
                          const uint8_t *in, size_t in_len)
{
    if (s == NULL || out == NULL || in == NULL) {
        return -1;
    }
    int r = srtp_unprotect(s->srtp, out, in, (size_t)in_len, out_cap);
    return r;
}

void shadow_srtp_close(struct shadow_srtp_session *s)
{
    if (s == NULL) {
        return;
    }
    if (s->srtp != NULL) {
        srtp_dealloc(s->srtp);
    }
    free(s);
}