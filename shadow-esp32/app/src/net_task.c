/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §后续动作 #7 — net_task owns Wi-Fi connectivity
 * and the mDNS responder that advertises this device on the LAN.
 * dialog_task waits on `shadow_net_wifi_up` before opening the
 * WebRTC signaling WebSocket (the WebSocket client itself is owned
 * by dialog_task, since the WebRTC peer is dialog_task's job).
 *
 * Scope of v1 (this file):
 *   - Wi-Fi connect via Zephyr wifi_mgmt with PSK security
 *   - Wi-Fi disconnect -> reconnect with 5 s backoff
 *   - mDNS responder enabled via CONFIG_MDNS_RESPONDER=y in
 *     app/prj.conf; service registration is Kconfig-driven, no
 *     additional C code needed for the basic `_shadow._tcp`
 *     announcement
 *
 * Out of scope (handled elsewhere):
 *   - WebSocket signaling client -> dialog_task (ADR-0002 v2 §4.3)
 *   - DNS-SD browse to locate the 端脑 -> follow-up commit
 *   - DTLS-SRTP media transport -> dialog_task + libsrtp (ADR-0002 v2 §后续动作 #3)
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/net/net_if.h>
#include <zephyr/net/wifi.h>
#include <zephyr/net/wifi_mgmt.h>
#include <zephyr/settings/settings.h>

#include <shadow_esp32/tasks.h>
#include <shadow_esp32/provision.h>

LOG_MODULE_REGISTER(shadow_net, CONFIG_SHADOW_ESP32_LOG_LEVEL);

K_THREAD_STACK_DEFINE(net_stack, SHADOW_NET_STACK_SIZE);
static struct k_thread net_thread;

K_SEM_DEFINE(shadow_net_wifi_up, 0, 1);

static struct net_mgmt_event_callback wifi_mgmt_cb;

static void wifi_reconnect_work_handler(struct k_work *work);

K_WORK_DELAYABLE_DEFINE(wifi_reconnect_work, wifi_reconnect_work_handler);

static void wifi_mgmt_handler(struct net_mgmt_event_callback *cb,
                               uint32_t mgmt_event,
                               struct net_if *iface)
{
    ARG_UNUSED(iface);

    switch (mgmt_event) {
    case NET_EVENT_WIFI_CONNECT_RESULT: {
        const struct wifi_status *status = cb->info;

        if (status != NULL && status->status != 0) {
            LOG_WRN("wifi connect failed: status=%d", status->status);
            break;
        }
        LOG_INF("wifi connected; signaling shadow_net_wifi_up");
        k_sem_give(&shadow_net_wifi_up);
        break;
    }
    case NET_EVENT_WIFI_DISCONNECT_RESULT: {
        LOG_WRN("wifi disconnected; will reconnect after 5 s");
        k_work_schedule(&wifi_reconnect_work, K_SECONDS(5));
        break;
    }
    default:
        break;
    }
}

static void wifi_reconnect_work_handler(struct k_work *work)
{
    ARG_UNUSED(work);

    struct net_if *iface = net_if_get_default();
    if (iface == NULL) {
        LOG_ERR("no default network interface");
        return;
    }

#if defined(CONFIG_SHADOW_WIFI_SSID) && defined(CONFIG_SHADOW_WIFI_PSK)
    struct wifi_connect_req_params cnx = {
        .ssid = CONFIG_SHADOW_WIFI_SSID,
        .ssid_length = strlen(CONFIG_SHADOW_WIFI_SSID),
        .psk = CONFIG_SHADOW_WIFI_PSK,
        .psk_length = strlen(CONFIG_SHADOW_WIFI_PSK),
        .security = WIFI_SECURITY_TYPE_PSK,
        .channel = 0,
        .band = WIFI_FREQ_BAND_2_4,
    };

    int rc = net_mgmt(NET_REQUEST_WIFI_CONNECT, iface, &cnx, sizeof(cnx));
    if (rc) {
        LOG_ERR("net_mgmt WIFI_CONNECT failed: %d", rc);
    }
#else
    LOG_WRN("CONFIG_SHADOW_WIFI_SSID / CONFIG_SHADOW_WIFI_PSK not set; "
            "skipped Wi-Fi connect. Set them in app/prj.conf.");
#endif
}

/* v2.5 — connect using credentials the provision module loaded
 * from settings (saved by the BLE GATT write callback). Returns
 * 0 on a successful mgmt request, negative on a hard error. */
static int wifi_connect_loaded_creds(void)
{
    char ssid[33] = { 0 };
    char psk[64]  = { 0 };
    size_t ssid_len = settings_read_one("shadow/wifi/ssid",
                                         ssid, sizeof(ssid) - 1);
    if (ssid_len == 0) {
        return -1;
    }
    ssid[ssid_len] = '\0';
    size_t psk_len = settings_read_one("shadow/wifi/psk",
                                        psk, sizeof(psk) - 1);
    psk[psk_len] = '\0';
    LOG_INF("wifi_connect_loaded_creds: ssid=%s psk_len=%zu", ssid, psk_len);

    struct net_if *iface = net_if_get_default();
    if (iface == NULL) {
        return -1;
    }
    struct wifi_connect_req_params cnx = {
        .ssid = ssid,
        .ssid_length = ssid_len,
        .psk = psk,
        .psk_length = psk_len,
        .security = WIFI_SECURITY_TYPE_PSK,
        .channel = 0,
        .band = WIFI_FREQ_BAND_2_4,
    };
    int rc = net_mgmt(NET_REQUEST_WIFI_CONNECT, iface, &cnx, sizeof(cnx));
    if (rc) {
        LOG_ERR("net_mgmt WIFI_CONNECT (loaded): %d", rc);
        return rc;
    }
    return 0;
}

static int wifi_event_init(void)
{
    net_mgmt_init_event_callback(&wifi_mgmt_cb, wifi_mgmt_handler,
                                  NET_EVENT_WIFI_CONNECT_RESULT |
                                  NET_EVENT_WIFI_DISCONNECT_RESULT);

    return net_mgmt_add_event_callback(&wifi_mgmt_cb);
}

static void net_task_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);

    LOG_INF("net_task started; mDNS responder advertises _shadow._tcp");

    if (wifi_event_init() != 0) {
        LOG_ERR("wifi mgmt event callback init failed; net_task idle");
        return;
    }

    /* v2.5 — try stored credentials first. If none, the
     * provision module's BLE GATT service is the fallback
     * (started from main() before net_task). In that path the
     * phone writes SSID+PSK → settings → we pick them up here
     * the next time the user re-touches this routine (or we
     * re-arm via the prov callback). */
    if (wifi_connect_loaded_creds() != 0) {
        LOG_WRN("no stored Wi-Fi creds yet; waiting for BLE provision");
    } else {
        /* The compiled-in CONFIG_SHADOW_WIFI_* path is the
         * developer convenience; once a phone provisions, the
         * settings-backed path is what runs in production. */
        (void)0;
    }
    wifi_reconnect_work_handler(NULL);

    while (1) {
        k_sleep(K_FOREVER);
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