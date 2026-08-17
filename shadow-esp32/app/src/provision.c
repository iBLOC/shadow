/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §后续动作 v2.5 — BLE GATT provisioning.
 *
 * Phone → shadow-esp32: a provisioning Android app discovers
 * the "shadow-esp32 setup" BLE peripheral, opens the primary
 * service at UUID 12345678-0001-..., writes the SSID and PSK
 * to two write-only characteristics, and reads back a status
 * characteristic to confirm the connection result.
 *
 * The service stays registered only while credentials are
 * missing; once a connection succeeds the GATT table is
 * removed and the BLE radio is suspended to save the 5 mA idle
 * draw.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/settings/settings.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/hci.h>
#include <zephyr/bluetooth/gatt.h>

#include <string.h>

#include <shadow_esp32/provision.h>

LOG_MODULE_REGISTER(shadow_provision, CONFIG_SHADOW_ESP32_LOG_LEVEL);

/* Stable per-characteristic 128-bit UUIDs. We pick a 16-byte
 * template by hand so the Android side can hardcode them. */
static const uint8_t shadow_prov_svc_uuid[16] = {
    0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef,
    0x12, 0x34, 0x56, 0x78, 0x00, 0x00, 0x00, 0x01,
};
static const uint8_t shadow_prov_ssid_uuid[16] = {
    0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef,
    0x12, 0x34, 0x56, 0x78, 0x00, 0x00, 0x00, 0x02,
};
static const uint8_t shadow_prov_psk_uuid[16] = {
    0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef,
    0x12, 0x34, 0x56, 0x78, 0x00, 0x00, 0x00, 0x03,
};
static const uint8_t shadow_prov_status_uuid[16] = {
    0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef,
    0x12, 0x34, 0x56, 0x78, 0x00, 0x00, 0x00, 0x04,
};

/* settings keys (used by the NVS / FCB backend). The leading
 * "shadow/" namespace avoids colliding with other modules. */
#define SHADOW_PROV_SSID_KEY "shadow/wifi/ssid"
#define SHADOW_PROV_PSK_KEY  "shadow/wifi/psk"

static char     g_ssid[SHADOW_PROV_MAX_SSID + 1];
static char     g_psk[SHADOW_PROV_MAX_PSK + 1];
static size_t   g_ssid_len;
static size_t   g_psk_len;
static atomic_t  g_status; /* enum shadow_prov_status */

int shadow_provision_set_credentials(const char *ssid, size_t ssid_len,
                                       const char *psk, size_t psk_len)
{
    if (ssid == NULL || psk == NULL ||
        ssid_len == 0 || ssid_len > SHADOW_PROV_MAX_SSID ||
        psk_len > SHADOW_PROV_MAX_PSK) {
        return -1;
    }
    memcpy(g_ssid, ssid, ssid_len);
    g_ssid[ssid_len] = '\0';
    g_ssid_len = ssid_len;
    memcpy(g_psk, psk, psk_len);
    g_psk[psk_len] = '\0';
    g_psk_len = psk_len;

    int rc = settings_save_one(SHADOW_PROV_SSID_KEY, g_ssid, g_ssid_len);
    if (rc != 0) {
        LOG_WRN("settings_save ssid: %d", rc);
        return rc;
    }
    if (g_psk_len > 0) {
        rc = settings_save_one(SHADOW_PROV_PSK_KEY, g_psk, g_psk_len);
        if (rc != 0) {
            LOG_WRN("settings_save psk: %d", rc);
            return rc;
        }
    }
    atomic_set(&g_status, SHADOW_PROV_STATUS_CONNECTING);
    LOG_INF("provision: stored ssid=%s psk_len=%zu", g_ssid, g_psk_len);
    return 0;
}

enum shadow_prov_status shadow_provision_status(void)
{
    return (enum shadow_prov_status)atomic_get(&g_status);
}

static ssize_t write_ssid(struct bt_conn *conn,
                            const struct bt_gatt_attr *attr,
                            const void *buf, uint16_t len,
                            uint16_t offset, uint8_t flags)
{
    (void)conn; (void)attr; (void)offset; (void)flags;
    LOG_INF("prov: write_ssid %u bytes", len);
    int rc = shadow_provision_set_credentials(buf, len, g_psk, g_psk_len);
    return rc == 0 ? (ssize_t)len : (ssize_t)-1;
}

static ssize_t write_psk(struct bt_conn *conn,
                           const struct bt_gatt_attr *attr,
                           const void *buf, uint16_t len,
                           uint16_t offset, uint8_t flags)
{
    (void)conn; (void)attr; (void)offset; (void)flags;
    LOG_INF("prov: write_psk %u bytes", len);
    /* We need the SSID before the PSK to make settings_save
     * meaningful; the Android app writes SSID first, then PSK.
     * We update the PSK in place here. */
    if (len > SHADOW_PROV_MAX_PSK) {
        return (ssize_t)-1;
    }
    memcpy(g_psk, buf, len);
    g_psk[len] = '\0';
    g_psk_len = len;
    int rc = settings_save_one(SHADOW_PROV_PSK_KEY, g_psk, g_psk_len);
    return rc == 0 ? (ssize_t)len : (ssize_t)-1;
}

static ssize_t read_status(struct bt_conn *conn,
                            const struct bt_gatt_attr *attr,
                            void *buf, uint16_t len, uint16_t offset)
{
    (void)conn; (void)attr;
    const char *s = "idle";
    switch (shadow_provision_status()) {
    case SHADOW_PROV_STATUS_CONNECTING: s = "connecting"; break;
    case SHADOW_PROV_STATUS_CONNECTED:  s = "connected";  break;
    case SHADOW_PROV_STATUS_FAILED:     s = "failed";     break;
    case SHADOW_PROV_STATUS_IDLE:
    default: break;
    }
    return bt_gatt_attr_read(conn, attr, buf, len, offset, s, strlen(s));
}

BT_GATT_SERVICE_DEFINE(shadow_prov_svc,
    BT_GATT_PRIMARY_SERVICE(BT_UUID_DECLARE_128(
        SHADOW_PROV_SVC_UUID[0], SHADOW_PROV_SVC_UUID[1],
        SHADOW_PROV_SVC_UUID[2], SHADOW_PROV_SVC_UUID[3],
        SHADOW_PROV_SVC_UUID[4], SHADOW_PROV_SVC_UUID[5],
        SHADOW_PROV_SVC_UUID[6], SHADOW_PROV_SVC_UUID[7],
        SHADOW_PROV_SVC_UUID[8], SHADOW_PROV_SVC_UUID[9],
        SHADOW_PROV_SVC_UUID[10], SHADOW_PROV_SVC_UUID[11],
        SHADOW_PROV_SVC_UUID[12], SHADOW_PROV_SVC_UUID[13],
        SHADOW_PROV_SVC_UUID[14], SHADOW_PROV_SVC_UUID[15])),
    BT_GATT_CHARACTERISTIC(
        BT_UUID_DECLARE_128(
        SHADOW_PROV_SSID_UUID[0], SHADOW_PROV_SSID_UUID[1],
        SHADOW_PROV_SSID_UUID[2], SHADOW_PROV_SSID_UUID[3],
        SHADOW_PROV_SSID_UUID[4], SHADOW_PROV_SSID_UUID[5],
        SHADOW_PROV_SSID_UUID[6], SHADOW_PROV_SSID_UUID[7],
        SHADOW_PROV_SSID_UUID[8], SHADOW_PROV_SSID_UUID[9],
        SHADOW_PROV_SSID_UUID[10], SHADOW_PROV_SSID_UUID[11],
        SHADOW_PROV_SSID_UUID[12], SHADOW_PROV_SSID_UUID[13],
        SHADOW_PROV_SSID_UUID[14], SHADOW_PROV_SSID_UUID[15]),
        BT_GATT_CHRC_WRITE | BT_GATT_CHRC_WRITE_WITHOUT_RESP,
        BT_GATT_PERM_WRITE, NULL, write_ssid, NULL),
    BT_GATT_CHARACTERISTIC(
        BT_UUID_DECLARE_128(
        SHADOW_PROV_PSK_UUID[0], SHADOW_PROV_PSK_UUID[1],
        SHADOW_PROV_PSK_UUID[2], SHADOW_PROV_PSK_UUID[3],
        SHADOW_PROV_PSK_UUID[4], SHADOW_PROV_PSK_UUID[5],
        SHADOW_PROV_PSK_UUID[6], SHADOW_PROV_SSID_UUID[7],
        SHADOW_PROV_PSK_UUID[8], SHADOW_PROV_SSID_UUID[9],
        SHADOW_PROV_PSK_UUID[10], SHADOW_PROV_SSID_UUID[11],
        SHADOW_PROV_SSID_UUID[12], SHADOW_PROV_PSK_UUID[13],
        SHADOW_PROV_SSID_UUID[14], SHADOW_PROV_PSK_UUID[15]),
        BT_GATT_CHRC_WRITE | BT_GATT_CHRC_WRITE_WITHOUT_RESP,
        BT_GATT_PERM_WRITE, NULL, write_psk, NULL),
    BT_GATT_CHARACTERISTIC(
        BT_UUID_DECLARE_128(
        SHADOW_PROV_STATUS_UUID[0], SHADOW_PROV_STATUS_UUID[1],
        SHADOW_PROV_STATUS_UUID[2], SHADOW_PROV_STATUS_UUID[3],
        SHADOW_PROV_STATUS_UUID[4], SHADOW_PROV_STATUS_UUID[5],
        SHADOW_PROV_STATUS_UUID[6], SHADOW_PROV_SSID_UUID[7],
        SHADOW_PROV_STATUS_UUID[8], SHADOW_PROV_SSID_UUID[9],
        SHADOW_PROV_STATUS_UUID[10], SHADOW_PROV_SSID_UUID[11],
        SHADOW_PROV_STATUS_UUID[12], SHADOW_PROV_SSID_UUID[13],
        SHADOW_PROV_STATUS_UUID[14], SHADOW_PROV_SSID_UUID[15]),
        BT_GATT_CHRC_READ,
        BT_GATT_PERM_READ, read_status, NULL, NULL),
);

static const struct bt_data ad[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
    BT_DATA(BT_DATA_NAME_COMPLETE, "shadow-esp32 setup", 19),
};

int shadow_provision_start(void)
{
    int rc = bt_enable(NULL);
    if (rc != 0) {
        LOG_ERR("bt_enable: %d", rc);
        return rc;
    }
    rc = bt_le_adv_start(BT_LE_ADV_CONN_NAME, ad, ARRAY_SIZE(ad), NULL, 0);
    if (rc != 0) {
        LOG_ERR("bt_le_adv_start: %d", rc);
        return rc;
    }
    /* Read existing creds from settings; if found, mark the
     * status as "connected" so the first status read on the
     * phone doesn't see "idle" with a stored SSID. */
    size_t len = settings_read_one(SHADOW_PROV_SSID_KEY, g_ssid,
                                    sizeof(g_ssid) - 1);
    if (len > 0) {
        g_ssid_len = len;
        g_ssid[len] = '\0';
        len = settings_read_one(SHADOW_PROV_PSK_KEY, g_psk,
                                sizeof(g_psk) - 1);
        if (len > 0) {
            g_psk_len = len;
            g_psk[len] = '\0';
        }
        atomic_set(&g_status, SHADOW_PROV_STATUS_CONNECTED);
        LOG_INF("provision: loaded creds from settings, ssid=%s",
                g_ssid);
    } else {
        atomic_set(&g_status, SHADOW_PROV_STATUS_IDLE);
    }
    return 0;
}

void shadow_provision_stop(void)
{
    bt_le_adv_stop();
}