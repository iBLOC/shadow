/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_AUDIO_H
#define SHADOW_ESP32_AUDIO_H

#include <stddef.h>
#include <stdint.h>

/* Opaque encoder / decoder handles. Backed by libopus. */
struct shadow_opus_encoder;
struct shadow_opus_decoder;

/* The voice pipeline in shadow-esp32 uses 16 kHz / 60 ms frames
 * (per xiaozhi-esp32's defaults). libopus supports both, but the
 * rest of the project assumes this exact configuration; changing
 * it here requires matching updates in dialog_task, led_task,
 * and the temporal-lobe answer. */
#define SHADOW_OPUS_SAMPLE_RATE_HZ  16000
#define SHADOW_OPUS_CHANNELS         1
/* 60 ms at 16 kHz mono = 960 samples per frame. */
#define SHADOW_OPUS_FRAME_SAMPLES    960
/* Worst-case Opus code size for our bitrate (~32 kbps) + FEC + DTX
 * at 60 ms. libopus docs put the upper bound at ~4000 bytes per
 * packet. We use 4000 to be safe; the actual payload is usually
 * 60-120 bytes. */
#define SHADOW_OPUS_MAX_PACKET       4000

/* Create an Opus encoder. Returns NULL on failure. The encoder
 * is configured for VoIP with FEC and DTX enabled; complexity is
 * set to 2 (conservative for ESP32-S3 Xtensa LX7 @ 240 MHz). */
struct shadow_opus_encoder *shadow_opus_encoder_open(void);

/* Encode a 60 ms PCM frame. `pcm` must point to
 * SHADOW_OPUS_FRAME_SAMPLES int16_t samples. The encoded bytes
 * are written to `out` (caller-owned, capacity SHADOW_OPUS_MAX_PACKET
 * is sufficient). Returns the encoded byte count, or a negative
 * libopus error code. */
int shadow_opus_encoder_encode(struct shadow_opus_encoder *enc,
                                 const int16_t *pcm,
                                 uint8_t *out, size_t out_cap);

void shadow_opus_encoder_close(struct shadow_opus_encoder *enc);

struct shadow_opus_decoder *shadow_opus_decoder_open(void);

/* Decode an Opus packet. The output is 960 int16_t samples (60 ms
 * at 16 kHz). `fec` is set to non-zero to request PLC-only
 * recovery for a lost packet. Returns 0 on success, negative on
 * error. */
int shadow_opus_decoder_decode(struct shadow_opus_decoder *dec,
                                 const uint8_t *opus, size_t opus_len,
                                 int16_t *out, int fec);

void shadow_opus_decoder_close(struct shadow_opus_decoder *dec);

#endif /* SHADOW_ESP32_AUDIO_H */