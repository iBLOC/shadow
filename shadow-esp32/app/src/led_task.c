/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §4.3 / §后续动作 #7a — led_task drives the
 * on-board RGB LED as a state indicator for the shadow-esp32
 * voice pipeline.
 *
 * Scope of v1 (this file):
 *   - Inherit a tiny state enum from xiaozhi-esp32's state
 *     machine
 *   - Subscribe to a k_msgq that dialog_task will post to
 *     (out-of-scope for v1, the queue is empty so led_task falls
 *     back to its internal timer-driven cycle)
 *   - Cycle the LED on / off as a heartbeat until dialog_task
 *     starts producing real state transitions
 *
 * Out of scope (follow-up commits):
 *   - Real RGB / WS2812 driver (overlay pins `shadow_led` to the
 *     on-board LED; v2 of io_task already drives it as a binary
 *     output; v3 of this task will use a proper WS2812 or
 *     PWM-LED driver for color)
 *   - State push from dialog_task (one-way k_msgq contract)
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/drivers/gpio.h>

#include <shadow_esp32/tasks.h>
#include <shadow_esp32/io_tools.h>

LOG_MODULE_REGISTER(shadow_led, CONFIG_SHADOW_ESP32_LOG_LEVEL);

enum shadow_led_state {
    LED_STATE_IDLE,
    LED_STATE_CONNECTING,
    LED_STATE_LISTENING,
    LED_STATE_SPEAKING,
    LED_STATE_FATAL,
};

K_THREAD_STACK_DEFINE(led_stack, SHADOW_LED_STACK_SIZE);
static struct k_thread led_thread;

/* One-way mailbox for dialog_task (or any peer) to push a state
 * transition. v1 leaves it empty; the LED cycles internally as a
 * heartbeat. */
struct led_state_msg {
    enum shadow_led_state state;
};
K_MSGQ_DEFINE(led_state_q, sizeof(struct led_state_msg), 8, 1);

static const struct gpio_dt_spec shadow_led =
    GPIO_DT_SPEC_GET(DT_NODELABEL(shadow_led));

/* Render the current state on the on-board LED. v1 uses the same
 * binary on/off `shadow_led` that io_task drives — the LED
 * simply turns on for "active" states (connecting / listening /
 * speaking) and off for idle / fatal. */
static void render_state(enum shadow_led_state s)
{
    if (!gpio_is_ready_dt(&shadow_led)) {
        return;
    }
    bool on = (s == LED_STATE_CONNECTING ||
               s == LED_STATE_LISTENING  ||
               s == LED_STATE_SPEAKING);
    gpio_pin_set_dt(&shadow_led, on ? 1 : 0);
}

static const char *state_name(enum shadow_led_state s)
{
    switch (s) {
    case LED_STATE_IDLE:       return "idle";
    case LED_STATE_CONNECTING: return "connecting";
    case LED_STATE_LISTENING:  return "listening";
    case LED_STATE_SPEAKING:   return "speaking";
    case LED_STATE_FATAL:      return "fatal";
    }
    return "?";
}

static void led_task_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);

    LOG_INF("led_task started; shadow_led ready=%d",
            gpio_is_ready_dt(&shadow_led));

    /* Default state until dialog_task takes over. */
    enum shadow_led_state current = LED_STATE_IDLE;
    render_state(current);

    /* Tick once per second. v1 just shows a heartbeat blink on
     * IDLE; real state-driven rendering lands when dialog_task
     * starts posting into led_state_q. */
    while (1) {
        struct led_state_msg msg;
        int got = k_msgq_get(&led_state_q, &msg, K_NO_WAIT);
        if (got == 0 && msg.state != current) {
            current = msg.state;
            render_state(current);
            LOG_INF("led_task state -> %s", state_name(current));
        }

        /* Heartbeat: pulse the LED for 50 ms once a second so
         * the operator can see that the firmware is alive even
         * when no MCP traffic is flowing. The state above is
         * overridden only while the heartbeat is on. */
        if (current == LED_STATE_IDLE || current == LED_STATE_FATAL) {
            render_state(LED_STATE_LISTENING);
            k_msleep(50);
            render_state(current);
        }
        k_msleep(1000);
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