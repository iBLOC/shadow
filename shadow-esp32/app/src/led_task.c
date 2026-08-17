/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §4.2 — led_task is the lowest-priority task; it
 * drives the on-board RGB LED or OLED to indicate state (idle /
 * connecting / listening / speaking / fatal). v1 is a heartbeat.
 * The real state-machine mapping (xiaozhi-esp32's `kDeviceState`
 * enum) lands with the dialog_task implementation per ADR-0002 v2
 * §后续动作 #3. */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(shadow_led, CONFIG_SHADOW_ESP32_LOG_LEVEL);

K_THREAD_STACK_DEFINE(led_stack, SHADOW_LED_STACK_SIZE);
static struct k_thread led_thread;

static void led_task_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);

    LOG_INF("led_task started");
    while (1) {
        LOG_DBG("led_task heartbeat");
        k_sleep(K_SECONDS(5));
    }
}

void shadow_led_task_start(void)
{
    k_thread_create(&led_thread, led_stack,
                    K_THREAD_STACK_SIZEOF(led_stack),
                    led_task_fn, NULL, NULL, NULL,
                    SHADOW_LED_PRIORITY, 0, K_NO_WAIT);
    k_thread_name_set(&led_thread, "led");
}