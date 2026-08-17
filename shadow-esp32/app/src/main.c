/* SPDX-License-Identifier: Apache-2.0 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include <shadow_esp32/tasks.h>
#include <shadow_esp32/usb_audio.h>
#include <shadow_esp32/provision.h>

#include <zephyr/settings/settings.h>

LOG_MODULE_REGISTER(shadow_main, CONFIG_SHADOW_ESP32_LOG_LEVEL);

int main(void)
{
    LOG_INF("shadow-esp32 booting (Zephyr %s)", KERNEL_VERSION_STRING);

    /* Load any NVS-stored config (SSID / PSK) before net_task
     * starts so its first connect attempt sees the credentials
     * the phone provisioned. */
    settings_subsys_init();

    /* v2.4 — register the USB Audio Class 1.0 device before
     * tasks start so the phone's USB enumeration sees it
     * immediately. Failure to register is non-fatal (the rest
     * of the pipeline still works) so we log and continue. */
    int usb_rc = shadow_usb_audio_init();
    if (usb_rc != 0) {
        LOG_WRN("usb audio init failed (%d); continuing without USB", usb_rc);
    }

    /* v2.5 — start the BLE GATT provisioning service. If we
     * already have stored credentials we close the GATT table
     * again so the radio can sleep; otherwise we keep the
     * peripheral advertising so the phone can discover and
     * connect. */
    int prov_rc = shadow_provision_start();
    if (prov_rc != 0) {
        LOG_WRN("provision init failed (%d); continuing without BLE", prov_rc);
    }

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