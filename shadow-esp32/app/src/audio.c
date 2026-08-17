/* SPDX-License-Identifier: Apache-2.0 */

/* ADR-0002 v2 §后续动作 #4a.1 — thin shadow-esp32 wrapper around
 * libopus (v1.5.2). libopus lives in `app/opus/libopus/` after
 * `west update` runs; this translation unit only references the
 * upstream `<opus.h>` API.
 *
 * v1 of this wrapper does not perform any audio I/O — it just
 * stands up an encoder/decoder and exposes a single encode +
 * decode round-trip. The real I²S mic / speaker DMA pipeline
 * lands in commit #4a.3 (audio pipeline). For now, dialog_task
 * calls these once to prove the libopus link is correct; the
 * CI build is the real validation.
 */

#include "opus.h"

#include <stdlib.h>
#include <string.h>

#include <shadow_esp32/audio.h>

struct shadow_opus_encoder {
    OpusEncoder *enc;
};

struct shadow_opus_decoder {
    OpusDecoder *dec;
};

struct shadow_opus_encoder *shadow_opus_encoder_open(void)
{
    int err = 0;
    OpusEncoder *enc = opus_encoder_create(SHADOW_OPUS_SAMPLE_RATE_HZ,
                                            SHADOW_OPUS_CHANNELS,
                                            OPUS_APPLICATION_VOIP, &err);
    if (enc == NULL) {
        return NULL;
    }

    /* Real-time VoIP profile. The values below are xiaozhi-esp32
     * defaults; we keep complexity=2 to leave headroom for the
     * rest of the pipeline (DTLS handshake, ICE candidates, etc.)
     * on the Xtensa LX7. */
    opus_encoder_ctl(enc, OPUS_SET_BITRATE(24000));
    opus_encoder_ctl(enc, OPUS_SET_COMPLEXITY(2));
    opus_encoder_ctl(enc, OPUS_SET_PACKET_LOSS_PERC(5));
    opus_encoder_ctl(enc, OPUS_SET_INBAND_FEC(1));
    opus_encoder_ctl(enc, OPUS_SET_DTX(1));
    opus_encoder_ctl(enc, OPUS_SET_COMPLEXITY(2));
    (void)OPUS_SET_LSB_DEPTH; /* keep -Wunused-result happy on some toolchains */

    struct shadow_opus_encoder *self =
        malloc(sizeof(struct shadow_opus_encoder));
    if (self == NULL) {
        opus_encoder_destroy(enc);
        return NULL;
    }
    self->enc = enc;
    return self;
}

int shadow_opus_encoder_encode(struct shadow_opus_encoder *enc,
                                 const int16_t *pcm,
                                 uint8_t *out, size_t out_cap)
{
    if (enc == NULL || pcm == NULL || out == NULL) {
        return -1;
    }
    /* libopus signature: opus_encode(enc, pcm, frame_size,
     * data, max_data_bytes). It returns the number of bytes
     * written or a negative error code. */
    opus_int32 n = opus_encode(enc->enc, pcm, SHADOW_OPUS_FRAME_SAMPLES,
                                out, (opus_int32)out_cap);
    return (int)n;
}

void shadow_opus_encoder_close(struct shadow_opus_encoder *enc)
{
    if (enc == NULL) {
        return;
    }
    if (enc->enc != NULL) {
        opus_encoder_destroy(enc->enc);
    }
    free(enc);
}

struct shadow_opus_decoder *shadow_opus_decoder_open(void)
{
    int err = 0;
    OpusDecoder *dec = opus_decoder_create(SHADOW_OPUS_SAMPLE_RATE_HZ,
                                            SHADOW_OPUS_CHANNELS, &err);
    if (dec == NULL) {
        return NULL;
    }
    struct shadow_opus_decoder *self =
        malloc(sizeof(struct shadow_opus_decoder));
    if (self == NULL) {
        opus_decoder_destroy(dec);
        return NULL;
    }
    self->dec = dec;
    return self;
}

int shadow_opus_decoder_decode(struct shadow_opus_decoder *dec,
                                 const uint8_t *opus, size_t opus_len,
                                 int16_t *out, int fec)
{
    if (dec == NULL || opus == NULL || out == NULL) {
        return -1;
    }
    /* libopus signature: opus_decode(dec, data, len, pcm,
     * frame_size, decode_fec). decode_fec=1 asks the decoder
     * to do PLC on a lost packet (use a NULL `data`). */
    int r = opus_decode(dec->dec, opus, (opus_int32)opus_len,
                        out, SHADOW_OPUS_FRAME_SAMPLES, fec);
    return r;
}

void shadow_opus_decoder_close(struct shadow_opus_decoder *dec)
{
    if (dec == NULL) {
        return;
    }
    if (dec->dec != NULL) {
        opus_decoder_destroy(dec->dec);
    }
    free(dec);
}