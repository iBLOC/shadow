/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_ICE_H
#define SHADOW_ESP32_ICE_H

#include <stddef.h>
#include <stdint.h>

/* ICE-lite (RFC 8445) implementation.
 *
 * shadow-esp32 is always the ICE-lite controlled agent (we
 * never initiate connectivity checks; we only ANSWER them).
 * Full ICE with STUN/TURN servers is the controlling-agent side
 * of the negotiation and lives in the temporal lobe; we just
 * collect host candidates and ship them in SDP.
 *
 * v1 of this module:
 *   - Collects host candidates from the device's local
 *     network interfaces (one per IPv4 address on non-loopback)
 *   - Serialises the candidate list as an `a=candidate:…` SDP
 *     fragment that the existing dialog_task signaling path can
 *     forward via the WebSocket
 *   - Has a `shadow_ice_get_local_candidates_sdp()` API
 *
 * v1.1 follow-up:
 *   - STUN binding response (we already answer checks but
 *     don't open the raw socket yet)
 *   - Trickle ICE (push candidates as they're discovered)
 */

struct shadow_ice_candidate {
    char foundation[16];  /* e.g., "1" */
    uint32_t component_id; /* RTP=1, RTCP=2 */
    char transport[8];     /* "UDP" */
    uint32_t priority;     /* 0..2^32-1 */
    char address[64];      /* dotted-quad IPv4 */
    uint16_t port;
    char type[8];          /* "host" */
};

int shadow_ice_candidate_count(void);

int shadow_ice_get_candidates(int idx,
                               struct shadow_ice_candidate *out);

/* Render the candidate list as a single multi-line SDP
 * fragment suitable for embedding inside the existing `a=`
 * block in the SDP offer. `buf` receives the rendered text. */
size_t shadow_ice_render_sdp_candidates(char *buf, size_t cap);

#endif /* SHADOW_ESP32_ICE_H */