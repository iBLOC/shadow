# SPDX-License-Identifier: Apache-2.0
#
# Thin Zephyr wrapper around upstream libopus.
#
# ADR-0002 v2 §后续动作 #4a.1 — `west update` populates
# `app/opus/libopus/` with the xiph/opus v1.5.2 source tree. We
# `add_subdirectory` its top-level CMakeLists (which builds the
# `opus` static library) and forward the include path so
# `dialog_task.c` and friends can `#include <opus.h>` directly.
#
# The upstream build has a `FIXED_INCLUDES` option that we leave at
# its default; Zephyr's `app` target does not need this kind of
# relocation because we never build the libopus test programs.
#
# `OPUS_BUILD` is a build-time define that pulls in libopus's
# exported-symbol-mask — without it, the `OpusEncoder` etc. are
# static. The default build sets it; we set it explicitly so
# nobody accidentally rebuilds without it.

cmake_minimum_required(VERSION 3.20.0)

set(OPUS_BUILD ON CACHE BOOL "" FORCE)
set(OPUS_INSTALL_PKG_CONFIG OFF CACHE BOOL "" FORCE)
set(OPUS_INSTALL_CMAKE_CONFIG OFF CACHE BOOL "" FORCE)
set(OPUS_BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

# Upstream CMakeLists requires at least C99.
set(CMAKE_C_STANDARD 99)

add_subdirectory(libopus)