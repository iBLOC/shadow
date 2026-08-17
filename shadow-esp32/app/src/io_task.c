/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §4.2 / §4.6 — io_task is the device-side MCP server:
 * receives JSON-RPC 2.0 messages over the WebRTC data channel
 * (forwarded by temporal lobe → cortex::mcp::device_router →
 * ESP32 SCTP), dispatches them to Zephyr device drivers (GPIO,
 * PWM, I²C sensor poll), and returns the result. v1 of this file
 * is a heartbeat. The MCP server implementation lands in the
 * io_task follow-up commit per ADR-0002 v2 §后续动作 #5. */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(shadow_io, CONFIG_SHADOW_ESP32_LOG_LEVEL);

K_THREAD_STACK_DEFINE(io_stack, SHADOW_IO_STACK_SIZE);
static struct k_thread io_thread;

static void io_task_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);

    LOG_INF("io_task started");
    while (1) {
        LOG_DBG("io_task heartbeat");
        k_sleep(K_SECONDS(2));
    }
}

void shadow_io_task_start(void)
{
    k_thread_create(&io_thread, io_stack,
                    K_THREAD_STACK_SIZEOF(io_stack),
                    io_task_fn, NULL, NULL, NULL,
                    SHADOW_IO_PRIORITY, 0, K_NO_WAIT);
    k_thread_name_set(&io_thread, "io");
}