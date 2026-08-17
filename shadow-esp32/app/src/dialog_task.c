/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §4.2 / §4.3 — dialog_task owns the WebRTC client
 * (SDP/ICE/DTLS-SRTP/Opus/SCTP data channel). v1 of this file
 * is a 1-second heartbeat so the Zephyr bring-up sequence can be
 * validated without depending on out-of-tree modules. The Opus
 * encoder / ICE-lite / DTLS-PSK / libsrtp implementations land in
 * the dialog_task follow-up commits per ADR-0002 v2 §后续动作
 * #3. */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(shadow_dialog, CONFIG_SHADOW_ESP32_LOG_LEVEL);

K_THREAD_STACK_DEFINE(dialog_stack, SHADOW_DIALOG_STACK_SIZE);
static struct k_thread dialog_thread;

static void dialog_task_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);

    LOG_INF("dialog_task started");
    while (1) {
        LOG_DBG("dialog_task heartbeat");
        k_sleep(K_SECONDS(1));
    }
}

void shadow_dialog_task_start(void)
{
    k_thread_create(&dialog_thread, dialog_stack,
                    K_THREAD_STACK_SIZEOF(dialog_stack),
                    dialog_task_fn, NULL, NULL, NULL,
                    SHADOW_DIALOG_PRIORITY, 0, K_NO_WAIT);
    k_thread_name_set(&dialog_thread, "dialog");
}