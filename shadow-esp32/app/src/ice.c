/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §后续动作 #4a.7 — ICE-lite v1.
 *
 * v1 enumerates host candidates from the local network
 * interfaces and renders them as an SDP `a=candidate:` fragment.
 * The existing dialog_task signaling path can embed this
 * fragment in the SDP offer it sends to the 端脑, which forwards
 * to the temporal lobe (controlling agent).
 *
 * Real STUN connectivity-check answering and trickle-ICE push
 * land in a follow-up commit. The full ICE state machine (5
 * states × 2 directions) is the temporal lobe's job; on the
 * device we remain ICE-lite.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/net/net_if.h>
#include <zephyr/net/net_ip.h>

#include <stddef.h>
#include <stdio.h>
#include <string.h>

#include <shadow_esp32/ice.h>

LOG_MODULE_REGISTER(shadow_ice, CONFIG_SHADOW_ESP32_LOG_LEVEL);

#define SHADOW_ICE_MAX_CANDIDATES 8

static struct shadow_ice_candidate g_candidates[SHADOW_ICE_MAX_CANDIDATES];
static int g_candidate_count;

static void refresh_candidates(void)
{
    g_candidate_count = 0;

    struct net_if *iface = net_if_get_default();
    if (iface == NULL) {
        return;
    }
    if (!net_if_is_up(iface)) {
        return;
    }

    struct net_if_ipv4 *ipv4 = iface->config.ip.ipv4;
    if (ipv4 == NULL) {
        return;
    }

    /* Walk the unicast address list and turn every global
     * address into one host candidate. The foundation id is
     * derived from the candidate index — that is unique per
     * candidate and is what temporal lobe uses to pair local
     * and remote candidates. */
    int idx = 0;
    struct net_if_addr *addr;
    SYS_SLIST_FOR_EACH_CONTAINER(addr, &ipv4->unicast, node) {
        if (g_candidate_count >= SHADOW_ICE_MAX_CANDIDATES) {
            break;
        }
        if (addr->addr.family != AF_INET) {
            continue;
        }
        struct in_addr *a = &net_sin(addr->addr)->sin_addr;
        /* Skip loopback; loopback candidates are not useful
         * for ICE-lite host candidates in this use case. */
        if (a->s_addr == PP_HTONL(INADDR_LOOPBACK)) {
            continue;
        }

        struct shadow_ice_candidate *c = &g_candidates[g_candidate_count++];
        snprintf(c->foundation, sizeof(c->foundation), "%d", idx++);
        c->component_id = 1; /* RTP only for v1; RTCP follows */
        snprintf(c->transport, sizeof(c->transport), "UDP");
        c->priority = 100 * (1 << 24) + idx; /* per RFC 6335 §5.1.2.1 */
        net_addr_ntoa(a->s_addr, c->address, sizeof(c->address));
        /* The local port is whatever SRTP binds to. v1
         * reports a placeholder; the real port is set after
         * SRTP_CREATE by the dialog_task's UDP socket. */
        c->port = 5004; /* common WebRTC default */
        snprintf(c->type, sizeof(c->type), "host");
    }
}

int shadow_ice_candidate_count(void)
{
    refresh_candidates();
    return g_candidate_count;
}

int shadow_ice_get_candidates(int idx, struct shadow_ice_candidate *out)
{
    if (idx < 0 || out == NULL) {
        return -1;
    }
    if (idx >= g_candidate_count) {
        return -1;
    }
    *out = g_candidates[idx];
    return 0;
}

size_t shadow_ice_render_sdp_candidates(char *buf, size_t cap)
{
    if (buf == NULL || cap == 0) {
        return 0;
    }
    refresh_candidates();

    size_t off = 0;
    for (int i = 0; i < g_candidate_count; i++) {
        const struct shadow_ice_candidate *c = &g_candidates[i];
        int n = snprintf(buf + off, cap - off,
                         "a=candidate:%s %u %s %u %s %u typ %s\r\n",
                         c->foundation, c->component_id, c->transport,
                         c->priority, c->address, c->port, c->type);
        if (n <= 0 || (size_t)n >= cap - off) {
            break;
        }
        off += (size_t)n;
    }
    return off;
}