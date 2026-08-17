/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §4.2 — net_task owns the Wi-Fi connection, mDNS
 * `_shadow._tcp` broadcast, and the WebSocket signaling client
 * to cortex's `/api/webrtc/{modality}/sessions/{id}/ws` endpoint.
 * v1 is a heartbeat. The real Wi-Fi connect + mDNS + signaling
 * implementation lands in the net_task follow-up commit per
 * ADR-0002 v2 §后续动作 #6. */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(shadow_net, CONFIG_SHADOW_ESP32_LOG_LEVEL);

K_THREAD_STACK_DEFINE(net_stack, SHADOW_NET_STACK_SIZE);
static struct k_thread net_thread;

static void net_task_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);

    LOG_INF("net_task started");
    while (1) {
        LOG_DBG("net_task heartbeat");
        k_sleep(K_SECONDS(2));
    }
}

void shadow_net_task_start(void)
{
    k_thread_create(&net_thread, net_stack,
                    K_THREAD_STACK_SIZEOF(net_stack),
                    net_task_fn, NULL, NULL, NULL,
                    SHADOW_NET_PRIORITY, 0, K_NO_WAIT);
    k_thread_name_set(&net_thread, "net");
}