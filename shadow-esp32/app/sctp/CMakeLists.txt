# SPDX-License-Identifier: Apache-2.0
#
# Zephyr wrapper for libusrsctp.
#
# ADR-0002 v2 §后续动作 #4a.8 v2.3 — `west update` populates
# `app/sctp/libusrsctp/` with the sctplab/usrsctp source. We
# `add_subdirectory(libusrsctp)` and forward the include path so
# the dialog_task data-channel path can `#include <usrsctp.h>`.
#
# libusrsctp's build options:
#   - `sctp_build_userspace=1` is the upstream default for the
#     `programs/` subdir; we don't build the programs so the
#     flag is irrelevant.
#   - `sctp_werror=0` matches Zephyr's permissive warning policy.
cmake_minimum_required(VERSION 3.20.0)
set(sctp_werror 0 CACHE BOOL "" FORCE)
add_subdirectory(libusrsctp)