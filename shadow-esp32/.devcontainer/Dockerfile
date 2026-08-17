# SPDX-License-Identifier: Apache-2.0
#
# Dev container for shadow-esp32 Zephyr application builds.
#
# ADR-0002 v2 §4.2 — Zephyr 4.4.x on ESP32-S3-DevKitC. The base
# image is `zephyrprojectrtos/zephyr-build` which bundles the
# Zephyr SDK 0.16+ and the xtensa-espressif_esp32s3 toolchain.
ARG DOCKER_TAG=0.16-3
FROM zephyrprojectrtos/zephyr-build:${DOCKER_TAG}

ENV LC_ALL=C.UTF-8
ENV LANG=C.UTF-8

RUN apt-get update -y && apt-get install -y --no-install-recommends \
        udev \
        git \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

# west is bundled into the base image; the workspace itself is
# mounted from the host. We just set the default working dir.
WORKDIR /workspaces/shadow-esp32

ENTRYPOINT [ "/bin/bash", "-c" ]