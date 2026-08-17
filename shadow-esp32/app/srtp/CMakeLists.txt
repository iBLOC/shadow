# SPDX-License-Identifier: Apache-2.0
#
# Thin Zephyr wrapper around upstream libsrtp (v2.7.0).
#
# ADR-0002 v2 §后续动作 #4a.2 — `west update` populates
# `app/srtp/libsrtp/` with the cisco/libsrtp v2.7.0 source tree.
# We `add_subdirectory` its top-level CMakeLists (which builds
# the `srtp2` static library) and forward the include path so
# `dialog_task.c` can `#include <srtp2/srtp.h>` directly.
#
# Build options:
#   - `ENABLE_OPENSSL=OFF` — we use libsrtp's built-in AES only;
#     OpenSSL is not available in the shadow-esp32 Zephyr build
#   - `ENABLE_GCM=OFF` for v1 — AES-GCM-128 SRTP requires an
#     additional algorithm; we keep AES-128-CM-HMAC-SHA1-80 which
#     is the WebRTC default and matches libsrtp's compiled
#     default. AES-GCM-256 is added in the post-quantum follow-up.

cmake_minimum_required(VERSION 3.20.0)

set(ENABLE_OPENSSL OFF CACHE BOOL "" FORCE)
set(ENABLE_GCM     OFF CACHE BOOL "" FORCE)

add_subdirectory(libsrtp)