/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_AUDIO_PIPELINE_H
#define SHADOW_ESP32_AUDIO_PIPELINE_H

#include <stdint.h>

/* One 60 ms PCM frame, 16 kHz, mono. Matches the dialog_task /
 * libopus configuration. */
#define SHADOW_AUDIO_FRAME_SAMPLES 960

/* Ring buffer depth. 4 frames = 240 ms of latency headroom
 * between the I²S capture thread and the consumer (opus encode
 * in dialog_task). Keeps the I²S peripheral fully fed at 16 kHz
 * even when the consumer thread is briefly blocked (DTLS
 * handshake, packet retransmit, log flush, etc.). */
#define SHADOW_AUDIO_RING_FRAMES    4

/* The voice-pipeline source. When the devicetree enables an I²S
 * bus (e.g., `&i2s0` with a PDM microphone), the pipeline reads
 * DMA-filled PCM from it. When the board has no audio hardware
 * (e.g., the bare ESP32-S3-DevKitC-1), the pipeline falls back
 * to a synthetic 440 Hz sine source so the application code
 * (opus → srtp → udp) is exercised end-to-end on real hardware. */
enum shadow_audio_source {
    SHADOW_AUDIO_SOURCE_NONE = 0,
    SHADOW_AUDIO_SOURCE_I2S  = 1,
    SHADOW_AUDIO_SOURCE_SYNTHETIC = 2,
};

/* Resolve the active source. Returns SHADOW_AUDIO_SOURCE_NONE
 * if neither I²S nor the synthetic fallback is available. */
enum shadow_audio_source shadow_audio_pipeline_source(void);

/* Start the pipeline. Idempotent. Returns 0 on success, negative
 * on error. v1.5 of this function spawns a background capture
 * thread that continuously drains I²S into a ring buffer. */
int shadow_audio_pipeline_start(void);

/* Stop the pipeline. Idempotent. */
void shadow_audio_pipeline_stop(void);

/* Fetch one 60 ms PCM frame into `pcm_out`. The buffer must hold
 * at least SHADOW_AUDIO_FRAME_SAMPLES int16_t samples. Returns 0
 * on success, negative on error.
 *
 * v1.5 (this commit): blocks on the ring buffer filled by the
 * capture thread. On bare devkitc with no real I²S mic, the
 * capture thread uses the synthetic source, so this function
 * still returns quickly with a 440 Hz sine wave. */
int shadow_audio_pipeline_read_pcm(int16_t *pcm_out);

#endif /* SHADOW_ESP32_AUDIO_PIPELINE_H */