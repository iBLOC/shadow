# SPDX-License-Identifier: Apache-2.0
#
# Top-level CMake project for shadow-esp32 (Zephyr application).
#
# ADR-0002 v2 §4.2 — Zephyr 4.4.x RTOS. The actual application
# sources live under `app/`; this top-level CMakeLists.txt is the
# west/Zephyr workspace entry point.
cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})

project(shadow_esp32 LANGUAGES C)

add_subdirectory(app)