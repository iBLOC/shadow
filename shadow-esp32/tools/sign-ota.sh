#!/usr/bin/env bash
# ADR-0002 v2 §后续动作 #10 — sign the shadow-esp32 image with
# imgtool so MCUboot can verify + slot it for A/B upgrade.
#
# Usage (from shadow-esp32 repo root):
#   west build -b esp32s3_devkitc app
#   tools/sign-ota.sh app/build/zephyr/zephyr.bin
#
# The output is `zephyr.signed.bin` in the same directory,
# ready for `mcumgr image upload` or storage on the secondary
# slot. The signing key is checked in at `tools/ota-signing-key.pem`
# (a development key — replace before production).
set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "usage: $0 <path-to-zephyr.bin> [version]" >&2
    exit 64
fi
INPUT="$1"
VERSION="${2:-0.0.1}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${REPO_ROOT}/tools/ota-signing-key.pem"
if [ ! -f "$KEY" ]; then
    echo "missing signing key: $KEY" >&2
    echo "generate one with: imgtool keygen -k $KEY -t rsa-2048" >&2
    exit 1
fi

if ! command -v imgtool >/dev/null 2>&1; then
    echo "imgtool not found in PATH; install it with: pip install imgtool" >&2
    exit 1
fi

OUTDIR="$(dirname "$INPUT")"
OUTPUT="${OUTDIR}/zephyr.signed.bin"

imgtool sign \
    --key "$KEY" \
    --version "$VERSION" \
    --header-size 0x40 \
    --pad-header \
    --align 4 \
    -o "$OUTPUT" \
    "$INPUT"

echo "signed image written to: $OUTPUT"
echo "version: $VERSION"
echo "upload with: mcumgr --host <esp32-host> image upload $OUTPUT"