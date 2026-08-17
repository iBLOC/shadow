/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_USB_AUDIO_H
#define SHADOW_ESP32_USB_AUDIO_H

#include <stddef.h>
#include <stdint.h>

/* UAC1 bidirectional audio sink (OUT, host→device playback)
 * + source (IN, device→host microphone capture).
 * Both directions use 16 kHz / 16-bit / mono.
 *
 * v2.7: added USB Audio IN so the phone can capture
 * shadow-esp32's mic (I²S PDM input → USB Audio IN → phone ASR).
 */

#define SHADOW_USB_AUDIO_FRAME_SAMPLES  16
#define SHADOW_USB_AUDIO_SAMPLE_RATE_HZ 16000
#define SHADOW_USB_AUDIO_BYTES_PER_FRAME  (SHADOW_USB_AUDIO_FRAME_SAMPLES * 2)

int shadow_usb_audio_init(void);
void shadow_usb_audio_run(void);

/* Push one 16 kHz / 16-bit / mono PCM frame into the USB Audio
 * IN endpoint (device→host microphone path). Returns 0 on
 * success, negative on overflow / not-ready. */
int shadow_usb_audio_send_pcm(const int16_t *pcm, size_t pcm_samples);

#endif /* SHADOW_ESP32_USB_AUDIO_H */