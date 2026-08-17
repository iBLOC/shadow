/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_PROVISION_H
#define SHADOW_ESP32_PROVISION_H

#include <stddef.h>

/* BLE GATT provisioning service.
 *
 * Phone → shadow-esp32: a provisioning Android app connects via
 * BLE, discovers the "shadow-esp32 setup" service, writes SSID
 * and PSK to dedicated characteristics, and waits for a "status"
 * characteristic to flip to "connected".
 *
 * UUIDs (custom 128-bit; not registered with the Bluetooth
 * SIG assigned numbers database — we own them):
 *   service    12345678-0001-...  primary "shadow provisioning"
 *   char ssid  12345678-0002-...  write  (UTF-8 SSID, <= 32 bytes)
 *   char psk   12345678-0003-...  write  (UTF-8 password, <= 63 bytes)
 *   char stat  12345678-0004-...  read   ("idle"|"connecting"|"connected"|"failed")
 *
 * The provisioning service is only active when the device has
 * no stored Wi-Fi credentials. Once the net_task has
 * successfully connected, the service de-registers itself and
 * BLE is put back to sleep (saves the 5 mA idle draw).
 */

#define SHADOW_PROV_MAX_SSID 32
#define SHADOW_PROV_MAX_PSK  63

enum shadow_prov_status {
    SHADOW_PROV_STATUS_IDLE       = 0,
    SHADOW_PROV_STATUS_CONNECTING = 1,
    SHADOW_PROV_STATUS_CONNECTED  = 2,
    SHADOW_PROV_STATUS_FAILED     = 3,
};

int  shadow_provision_start(void);
void shadow_provision_stop(void);

enum shadow_prov_status shadow_provision_status(void);

/* Persist SSID + PSK to settings. Called by the GATT write
 * callbacks; the net_task polls for these. */
int  shadow_provision_set_credentials(const char *ssid, size_t ssid_len,
                                       const char *psk, size_t psk_len);

#endif /* SHADOW_ESP32_PROVISION_H */