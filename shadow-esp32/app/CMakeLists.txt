# SPDX-License-Identifier: Apache-2.0
#
# Zephyr application CMakeLists.txt for shadow-esp32.
#
# ADR-0002 v2 §4.2 — `app/` is the Zephyr RTOS application; the
# real-time tasks (`dialog_task`, `io_task`, `net_task`,
# `led_task`) each live in their own translation unit so that
# stack budgets and compile units can evolve independently.

cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})

project(shadow_esp32_app LANGUAGES C)

target_sources(app PRIVATE
    src/main.c
    src/dialog_task.c
    src/io_task.c
    src/net_task.c
    src/led_task.c
)

target_include_directories(app PRIVATE src/include)

# Out-of-tree libs that we expect to add in follow-up ADR-0002 v2
# §后续动作 #3-#5. Listed as commented targets so the Zephyr
# build will surface missing modules loudly instead of silently
# skipping them:
#   - libopus (audio codec, owt-tree style)
#   - libsrtp (RFC 3711, RFC 5764)
#   - webrtc-stack-stub (DTLS PSK + ICE-lite)
# Each will be added as a `zephyr_module(...)` entry under
# `app/` in their respective ADR.

zephyr_library_named(shadow_esp32_app)