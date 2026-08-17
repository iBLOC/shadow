/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §后续动作 v2.7 — USB Audio Class 1.0 bidirectional
 * device: OUT (host→device playback) + IN (device→host mic capture).
 *
 * Both directions use 16 kHz / 16-bit / mono.
 *
 * OUT:  phone TTS → USB OUT → shadow-esp32 → I²S TX → speaker
 *   IN: shadow-esp32 mic → I²S PDM capture → USB IN → phone ASR
 *
 * The voice-assistant bidirectional flow uses BOTH directions
 * simultaneously. The livestream flow only uses OUT.
 *
 * Zephyr's UAC1 device driver handles the USB Audio Class
 * descriptors + isochronous endpoint setup; this file adds
 * the device-side PCM routing.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/usb/usb_device.h>
#include <zephyr/usb/class/usb_audio.h>

#include <shadow_esp32/usb_audio.h>
#include <shadow_esp32/audio_pipeline.h>

LOG_MODULE_REGISTER(shadow_usb_audio, CONFIG_SHADOW_ESP32_LOG_LEVEL);

/* OUT callback: phone sends us PCM. We forward it to the
 * audio pipeline's I²S TX path for speaker playback. */
static int out_received_cb(const uint8_t *data, size_t size, void *user_data)
{
    (void)user_data;
    if (size < SHADOW_USB_AUDIO_BYTES_PER_FRAME) {
        return 0;
    }
    int16_t pcm[SHADOW_USB_AUDIO_FRAME_SAMPLES];
    for (int i = 0; i < SHADOW_USB_AUDIO_FRAME_SAMPLES; i++) {
        const uint8_t *p = data + i * 2;
        pcm[i] = (int16_t)((int16_t)(p[1] << 8) | p[0]);
    }
    shadow_audio_pipeline_write_pcm(pcm);
    return 0;
}

/* IN request callback: host polls us for mic data.
 * We pull one 16 kHz frame from the audio pipeline's
 * capture path and deliver it as raw PCM. */
static int in_requested_cb(uint8_t **buf, size_t *size, void *user_data)
{
    (void)user_data;
    static int16_t pcm[SHADOW_USB_AUDIO_FRAME_SAMPLES];
    int rc = shadow_audio_pipeline_read_pcm(pcm);
    if (rc != 0) {
        /* Capture not ready (no mic wired or not started);
         * fill silence so the host stream doesn't stall. */
        memset(pcm, 0, sizeof(pcm));
    }
    *buf = (uint8_t *)pcm;
    *size = SHADOW_USB_AUDIO_BYTES_PER_FRAME;
    return 0;
}

static const struct uac1_config uac_cfg = {
    .data_received_cb = out_received_cb,   /* OUT: host → device */
    .data_request_cb  = in_requested_cb,   /* IN:  device → host */
};

int shadow_usb_audio_init(void)
{
    int err = usb_audio_register_device(&uac_cfg);
    if (err != 0) {
        LOG_ERR("usb_audio_register_device: %d", err);
        return err;
    }
    LOG_INF("uac1 device registered (16 kHz / 16-bit / mono OUT + IN)");
    return 0;
}

void shadow_usb_audio_run(void)
{
    while (1) {
        k_sleep(K_FOREVER);
    }
}

int shadow_usb_audio_send_pcm(const int16_t *pcm, size_t pcm_samples)
{
    (void)pcm;
    (void)pcm_samples;
    /* v2.7: host polls us via IN request callback above,
     * so `usb_audio_send` is not used. A future commit
     * may switch to a timer-driven push model for lower
     * latency; until then this is a no-op. */
    return 0;
}