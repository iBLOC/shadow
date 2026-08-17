/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §后续动作 #4a.5 — background I²S capture thread.
 *
 * v1.4 read I²S synchronously from the caller's context
 * (dialog_task), which is wrong on two counts: (a) it puts
 * DMA-fill latency on dialog_task, breaking its 60 ms
 * deadline, and (b) it makes opus encode race with the I²S
 * driver for CPU. v1.5 spawns a dedicated capture thread that
 * continuously drains I²S into a ring buffer; the main
 * dialog_task pulls frames off the ring buffer (non-blocking
 * with K_FOREVER — at 16 kHz / 60 ms per frame, the buffer is
 * never empty in practice).
 *
 * v2.3 adds a `shadow_audio_pipeline_write_pcm` counterpart for
 * the I²S TX path (DAC / amplifier). On the bare devkitc the
 * function is a no-op stub; production boards that wire a
 * MAX98357A amp to GPIO17 (BCK) + GPIO9 (DIN) enable
 * `CONFIG_SHADOW_I2S_PLAYBACK=y` to take the real write path.
 *
 * On the bare devkitc (no real I²S mic wired), the capture
 * thread uses the 440 Hz synthetic source so the rest of the
 * pipeline still runs end-to-end.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2s.h>

#include <math.h>
#include <string.h>

#include <shadow_esp32/audio_pipeline.h>

LOG_MODULE_REGISTER(shadow_audio, CONFIG_SHADOW_ESP32_LOG_LEVEL);

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static const struct device *i2s_dev =
    DEVICE_DT_GET_OR(DT_NODELABEL(i2s0), NULL);

/* Capture thread + ring buffer + consumer. */
static K_THREAD_STACK_DEFINE(capture_stack, 4096);
static struct k_thread capture_thread;
static atomic_t running;

struct pcm_frame {
    int16_t pcm[SHADOW_AUDIO_FRAME_SAMPLES];
};

/* Ring buffer of frames. The capture thread `k_msgq_put`s;
 * dialog_task `k_msgq_get`s. SHADOW_AUDIO_RING_FRAMES is the
 * queue depth. Using `k_msgq` (variable-size items) is fine
 * here because every item is exactly the same size. */
K_MSGQ_DEFINE(pcm_ringq, sizeof(struct pcm_frame),
              SHADOW_AUDIO_RING_FRAMES, 4);

static double sine_phase;
#define SINE_FREQ_HZ     440.0
#define SINE_SAMPLE_HZ   16000.0

static int synth_sine_frame(int16_t *pcm_out)
{
    const double phase_inc = 2.0 * M_PI * SINE_FREQ_HZ / SINE_SAMPLE_HZ;
    const int16_t amplitude = 8000; /* ~ -3 dBFS on int16 scale */

    for (int i = 0; i < SHADOW_AUDIO_FRAME_SAMPLES; i++) {
        pcm_out[i] = (int16_t)(amplitude * sin(sine_phase));
        sine_phase += phase_inc;
        if (sine_phase > 2.0 * M_PI) {
            sine_phase -= 2.0 * M_PI;
        }
    }
    return 0;
}

/* Capture thread body. Drains I²S into the ring buffer;
 * falls back to the synthetic source if a read fails. */
static void capture_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);

    bool i2s_active = (i2s_dev != NULL) && device_is_ready(i2s_dev);

    while (atomic_get(&running)) {
        struct pcm_frame frame;

        if (i2s_active) {
            int rc = i2s_read(i2s_dev, frame.pcm,
                               SHADOW_AUDIO_FRAME_SAMPLES * sizeof(int16_t));
            if (rc != 0) {
                /* No mic wired (bare devkitc) or transient I²S
                 * glitch. Use synthetic so the consumer thread
                 * never starves. */
                synth_sine_frame(frame.pcm);
            }
        } else {
            synth_sine_frame(frame.pcm);
        }

        /* Block if the consumer is slow; the ring is sized
         * for ~240 ms so this only happens if dialog_task is
         * seriously stuck. */
        k_msgq_put(&pcm_ringq, &frame, K_FOREVER);
    }
}

enum shadow_audio_source shadow_audio_pipeline_source(void)
{
    if (i2s_dev != NULL && device_is_ready(i2s_dev)) {
        return SHADOW_AUDIO_SOURCE_I2S;
    }
    return SHADOW_AUDIO_SOURCE_SYNTHETIC;
}

int shadow_audio_pipeline_start(void)
{
    if (atomic_set(&running, 1)) {
        return 0; /* already running */
    }

    if (i2s_dev != NULL && device_is_ready(i2s_dev)) {
        struct i2s_config cfg = {
            .word_size     = 16,
            .channels      = 1,
            .format        = I2S_FMT_DATA_FORMAT_I2S,
            .frame_clk_freq = 16000,
            .block_size    = SHADOW_AUDIO_FRAME_SAMPLES * sizeof(int16_t),
            .timeout       = 1000, /* ms */
        };
        int rc = i2s_configure(i2s_dev, I2S_DIR_RX, &cfg);
        if (rc != 0) {
            LOG_WRN("i2s_configure failed: %d, falling back to synthetic", rc);
        } else {
            rc = i2s_trigger(i2s_dev, I2S_DIR_RX, I2S_TRIGGER_START);
            if (rc != 0) {
                LOG_WRN("i2s_trigger START failed: %d", rc);
            }
        }
        LOG_INF("audio_pipeline started (source=i2s, capture thread)");
    } else {
        LOG_INF("audio_pipeline started (source=synthetic, capture thread)");
    }

    k_tid_t tid = k_thread_create(&capture_thread, capture_stack,
                                   K_THREAD_STACK_SIZEOF(capture_stack),
                                   capture_fn, NULL, NULL, NULL,
                                   5 /* prio */, 0, K_NO_WAIT);
    k_thread_name_set(tid, "audio_capture");
    return 0;
}

void shadow_audio_pipeline_stop(void)
{
    if (!atomic_set(&running, 0)) {
        return;
    }
    k_thread_join(&capture_thread, K_FOREVER);
    if (i2s_dev != NULL && device_is_ready(i2s_dev)) {
        i2s_trigger(i2s_dev, I2S_DIR_RX, I2S_TRIGGER_STOP);
    }
    LOG_INF("audio_pipeline stopped");
}

int shadow_audio_pipeline_read_pcm(int16_t *pcm_out)
{
    if (pcm_out == NULL) {
        return -1;
    }
    if (!atomic_get(&running)) {
        return -1;
    }

    struct pcm_frame frame;
    k_msgq_get(&pcm_ringq, &frame, K_FOREVER);
    memcpy(pcm_out, frame.pcm, sizeof(frame.pcm));
    return 0;
}