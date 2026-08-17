/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_IO_TOOLS_H
#define SHADOW_ESP32_IO_TOOLS_H

#include <stdbool.h>
#include <stddef.h>

/* Result of a tool invocation. The handler fills `result` and
 * returns 0 on success, or a negative error code. A positive
 * value is reserved for "handled but error": the message is
 * returned in `result` as the user-facing error string. */
typedef int (*shadow_tool_fn)(const char *args_json,
                              char *result, size_t result_cap);

/* One registered tool. `name` is the MCP dotted name
 * (e.g. "self.light.set_rgb"). `description` and
 * `input_schema_json` are returned verbatim in `tools/list`
 * responses. `user_only` flags privileged tools (system.reboot,
 * firmware upgrade) that the LLM agent should not invoke without
 * a user-flagged session. */
struct shadow_tool {
    const char *name;
    const char *description;
    const char *input_schema_json;
    bool user_only;
    shadow_tool_fn invoke;
};

/* Register a tool. Returns 0 on success, -1 if the registry is
 * full (SHADOW_MAX_TOOLS). Idempotent: re-registering an
 * existing name replaces the previous entry. */
int shadow_io_register_tool(const struct shadow_tool *tool);

/* Number of currently-registered tools. */
size_t shadow_io_tool_count(void);

/* Serialize the registered tools as a JSON value matching MCP
 * `tools/list` response shape: {"tools":[{...}, ...]}.
 * Returns the number of bytes written, or 0 on overflow. */
size_t shadow_io_list_tools_json(char *buf, size_t cap);

/* Dispatch a JSON-RPC 2.0 envelope. `request` is a single
 * JSON-RPC message; `response` receives the reply (success
 * or JSON-RPC error). The dispatcher handles `initialize`,
 * `tools/list`, and `tools/call`; anything else returns a
 * method-not-found error.
 *
 * Returns the number of bytes written to `response`, or 0 on
 * overflow. */
size_t shadow_io_invoke_mcp(const char *request,
                              char *response, size_t cap);

#endif /* SHADOW_ESP32_IO_TOOLS_H */