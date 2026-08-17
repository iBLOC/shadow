/* SPDX-License-Identifier: Apache-2.0 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include <shadow_esp32/tasks.h>

LOG_MODULE_REGISTER(shadow_main, CONFIG_SHADOW_ESP32_LOG_LEVEL);

int main(void)
{
    LOG_INF("shadow-esp32 booting (Zephyr %s)", KERNEL_VERSION_STRING);

    /* ADR-0002 v2 §4.2 — five tasks. Each task module owns its
     * own start function and stack; main() only triggers them. */
    shadow_net_task_start();
    shadow_io_task_start();
    shadow_led_task_start();
    shadow_dialog_task_start();

    /* Main thread returns; the kernel scheduler runs the four
     * worker threads. New work can be queued via k_work or a
     * shared workqueue from any task. */
    LOG_INF("shadow-esp32 booted; main thread idle");
    return 0;
}