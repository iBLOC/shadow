/* SPDX-License-Identifier: Apache-2.0 */

static const struct gpio_dt_spec shadow_led    = GPIO_DT_SPEC_GET(DT_NODELABEL(shadow_led));
static const struct gpio_dt_spec shadow_out_a  = GPIO_DT_SPEC_GET(DT_NODELABEL(shadow_out_a));
static const struct gpio_dt_spec shadow_out_b  = GPIO_DT_SPEC_GET(DT_NODELABEL(shadow_out_b));
static const struct gpio_dt_spec shadow_in_a   = GPIO_DT_SPEC_GET(DT_NODELABEL(shadow_in_a));

/* ADR-0002 v2 §4.6 / §后续动作 #6 — io_task owns the device-side
 * MCP server. v2 implements:
 *   - Tool registry holding up to 16 tools
 *   - JSON-RPC 2.0 dispatcher (`initialize`, `tools/list`,
 *     `tools/call`) — same wire format as xiaozhi-esp32
 *   - v2 tools wired to a Zephyr `gpio_dt_spec` lookup:
 *       `self.io.gpio_set`  / `self.io.gpio_get`
 *         — drives `shadow_out_a` (GPIO1), `shadow_out_b`
 *           (GPIO2), `shadow_led` (GPIO48); reads `shadow_in_a`
 *           (GPIO4). Pin alias map is explicit (no raw pin
 *           numbers) to avoid accidentally toggling unrelated
 *           pins on the devkitc.
 *       `self.light.set_rgb`  / `self.light.set_brightness`
 *         — v2 folds the (r, g, b) channels into a binary LED
 *           on/off state on `shadow_led`; WS2812 / PWM RGB
 *           lands in a follow-up commit
 *       `self.system.reboot`
 *         — calls `sys_reboot(SYS_REBOOT_WARM)`; `user_only=true`
 *
 * The transport that will eventually deliver JSON-RPC frames to
 * io_task is the WebRTC data channel owned by dialog_task. v2
 * exposes the dispatcher as a plain C function so dialog_task can
 * call it once the data channel is wired up.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/reboot.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/pwm.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/drivers/led_strip.h>

#include <ctype.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#include <shadow_esp32/tasks.h>
#include <shadow_esp32/io_tools.h>

LOG_MODULE_REGISTER(shadow_io, CONFIG_SHADOW_ESP32_LOG_LEVEL);

#ifndef SHADOW_MAX_TOOLS
#define SHADOW_MAX_TOOLS 16
#endif

/* Aligned lookup table — indexed by enum — gives O(1) dispatch
 * and deterministic ordering of `tools/list` responses. */
static struct shadow_tool g_tools[SHADOW_MAX_TOOLS];
static size_t g_tool_count;

int shadow_io_register_tool(const struct shadow_tool *tool)
{
    if (tool == NULL || tool->name == NULL || tool->invoke == NULL) {
        return -1;
    }

    /* Idempotent: replace by name. */
    for (size_t i = 0; i < g_tool_count; i++) {
        if (strcmp(g_tools[i].name, tool->name) == 0) {
            g_tools[i] = *tool;
            return 0;
        }
    }

    if (g_tool_count >= SHADOW_MAX_TOOLS) {
        return -1;
    }
    g_tools[g_tool_count++] = *tool;
    return 0;
}

size_t shadow_io_tool_count(void)
{
    return g_tool_count;
}

/* --- v1 tools -------------------------------------------------------- */

static int tool_io_gpio_set(const char *args, char *result, size_t cap)
{
    int pin = 0, value = 0;

    if (sscanf(args, " {\"pin\":%d,\"value\":%d}", &pin, &value) != 2 &&
        sscanf(args, "{\"pin\":%d,\"value\":%d}", &pin, &value) != 2) {
        snprintf(result, cap, "expected {\"pin\":N,\"value\":0|1}");
        return -1;
    }

    /* Resolve the devicetree alias for this pin. v2 supports
     * exactly four shadow_* aliases — `shadow_led`, `shadow_out_a`,
     * `shadow_out_b`, `shadow_in_a` — to avoid accidentally
     * toggling unrelated pins on the devkitc. */
    const struct gpio_dt_spec *spec = NULL;
    switch (pin) {
    case 1:  spec = &shadow_out_a; break;
    case 2:  spec = &shadow_out_b; break;
    case 48: spec = &shadow_led;    break;
    default:
        snprintf(result, cap,
                 "{\"ok\":false,\"error\":\"pin %d not in devicetree aliases\"}",
                 pin);
        return -1;
    }

    if (!gpio_is_ready_dt(spec)) {
        snprintf(result, cap, "{\"ok\":false,\"error\":\"gpio not ready\"}");
        return -1;
    }
    int rc = gpio_pin_set_dt(spec, value ? 1 : 0);
    if (rc != 0) {
        snprintf(result, cap, "{\"ok\":false,\"error\":\"gpio_pin_set_dt=%d\"}", rc);
        return -1;
    }
    snprintf(result, cap, "{\"ok\":true,\"pin\":%d,\"value\":%d}", pin, value);
    return 0;
}

static int tool_io_gpio_get(const char *args, char *result, size_t cap)
{
    int pin = 0;

    if (sscanf(args, " {\"pin\":%d}", &pin) != 1 &&
        sscanf(args, "{\"pin\":%d}", &pin) != 1) {
        snprintf(result, cap, "expected {\"pin\":N}");
        return -1;
    }

    const struct gpio_dt_spec *spec = NULL;
    switch (pin) {
    case 4: spec = &shadow_in_a; break;
    default:
        snprintf(result, cap,
                 "{\"ok\":false,\"error\":\"pin %d not readable\"}", pin);
        return -1;
    }

    if (!gpio_is_ready_dt(spec)) {
        snprintf(result, cap, "{\"ok\":false,\"error\":\"gpio not ready\"}");
        return -1;
    }
    int v = gpio_pin_get_dt(spec);
    snprintf(result, cap, "{\"ok\":true,\"pin\":%d,\"value\":%d}", pin, v);
    return 0;
}

static int tool_system_reboot(const char *args, char *result, size_t cap)
{
    ARG_UNUSED(args);
    LOG_WRN("tool: system.reboot invoked; rebooting in 200 ms");
    snprintf(result, cap, "{\"ok\":true,\"action\":\"reboot_scheduled\"}");
    /* Defer the actual reboot so the JSON-RPC response has a
     * chance to flush back to the MCP client. */
    k_msleep(200);
    sys_reboot(SYS_REBOOT_WARM);
    return 0; /* unreachable */
}

static int tool_sensor_read(const char *args, char *result, size_t cap)
{
    int reg = 0;

    if (sscanf(args, " {\"reg\":%d}", &reg) != 1 &&
        sscanf(args, "{\"reg\":%d}", &reg) != 1) {
        snprintf(result, cap, "expected {\"reg\":N}");
        return -1;
    }

    /* Read one byte from the I²C sensor on `&i2c0` at the
     * address declared in the devicetree overlay
     * (`shadow_sensor@0x68`). v1 only implements a single-
     * byte register read; multi-byte / burst reads land in
     * a follow-up commit. */
    static const struct device *i2c_dev =
        DEVICE_DT_GET_OR(DT_NODELABEL(i2c0), NULL);
    if (i2c_dev == NULL || !device_is_ready(i2c_dev)) {
        snprintf(result, cap,
                 "{\"ok\":false,\"error\":\"i2c0 not ready\"}");
        return -1;
    }
    uint8_t addr = DT_REG_ADDR(DT_NODELABEL(shadow_sensor));
    uint8_t val = 0;
    int rc = i2c_reg_read_byte(i2c_dev, addr, reg, &val);
    if (rc != 0) {
        snprintf(result, cap,
                 "{\"ok\":false,\"error\":\"i2c_reg_read_byte=%d\"}", rc);
        return -1;
    }
    snprintf(result, cap,
             "{\"ok\":true,\"bus\":0,\"addr\":\"0x%02x\",\"reg\":%d,"
             "\"value\":%u}",
             addr, reg, (unsigned)val);
    return 0;
}

static int tool_event_danmaku(const char *args, char *result, size_t cap)
{
    /* Extract "text":"..." from the args JSON. Naive parse is
     * enough for v1 — we don't need a full JSON parser for one
     * string field. */
    static const char key[] = "\"text\":\"";
    const char *p = strstr(args, key);
    if (p == NULL) {
        snprintf(result, cap, "expected {\"text\":\"...\"}");
        return -1;
    }
    p += sizeof(key) - 1;
    const char *end = strchr(p, '"');
    if (end == NULL) {
        snprintf(result, cap, "expected closing quote in text");
        return -1;
    }
    size_t len = (size_t)(end - p);
    char text[256];
    if (len >= sizeof(text)) {
        len = sizeof(text) - 1;
    }
    memcpy(text, p, len);
    text[len] = '\0';

    /* Log + acknowledge. v2.4 just records; a future commit
     * posts the text to cortex's A2A endpoint so the LLM can
     * treat it as a user utterance and respond through the
     * existing dialog_task WebRTC path. */
    LOG_INF("danmaku: %s", text);

    /* Briefly indicate the event on the LED so the operator can
     * see that the path is live. led_task's existing loop
     * resumes the heartbeat after the next 1 s tick. */
    extern void shadow_led_pulse_event(void);
    shadow_led_pulse_event();

    snprintf(result, cap,
             "{\"ok\":true,\"received\":\"%s\",\"forwarded\":false}", text);
    return 0;
}

static int tool_light_set_rgb(const char *args, char *result, size_t cap)
{
    int r = 0, g = 0, b = 0;

    if (sscanf(args, " {\"r\":%d,\"g\":%d,\"b\":%d}", &r, &g, &b) != 3 &&
        sscanf(args, "{\"r\":%d,\"g\":%d,\"b\":%d}", &r, &g, &b) != 3) {
        snprintf(result, cap, "expected {\"r\":N,\"g\":N,\"b\":N}");
        return -1;
    }

    /* WS2812 path: if a `led_strip` node is present in the
     * devicetree, drive the strip directly. Fall back to the
     * GPIO binary on/off for boards that have a single LED on
     * `shadow_led` but no WS2812 strip. */
    static const struct device *strip =
        DEVICE_DT_GET_OR(DT_NODELABEL(ws2812_strip), NULL);
    if (strip != NULL && device_is_ready(strip)) {
        struct led_rgb pixel = { .r = r, .g = g, .b = b };
        int rc = led_strip_update_rgb(strip, &pixel, 1);
        if (rc != 0) {
            snprintf(result, cap, "{\"ok\":false,\"error\":\"led_strip=%d\"}", rc);
            return -1;
        }
        snprintf(result, cap,
                 "{\"ok\":true,\"mode\":\"ws2812\",\"r\":%d,\"g\":%d,\"b\":%d}",
                 r, g, b);
        return 0;
    }

    /* v2 fallback: single on-board LED on GPIO48. RGB
     * channels fold to a binary on/off state. */
    if (!gpio_is_ready_dt(&shadow_led)) {
        snprintf(result, cap,
                 "{\"ok\":false,\"error\":\"no LED device ready\"}");
        return -1;
    }
    int on = (r > 0) || (g > 0) || (b > 0);
    int rc = gpio_pin_set_dt(&shadow_led, on ? 1 : 0);
    if (rc != 0) {
        snprintf(result, cap, "{\"ok\":false,\"error\":\"gpio_pin_set_dt=%d\"}", rc);
        return -1;
    }
    snprintf(result, cap,
             "{\"ok\":true,\"mode\":\"binary\",\"r\":%d,\"g\":%d,\"b\":%d,"
             "\"led\":\"%s\"}",
             r, g, b, on ? "on" : "off");
    return 0;
}

static int tool_light_set_brightness(const char *args, char *result, size_t cap)
{
    int level = 0;

    if (sscanf(args, " {\"level\":%d}", &level) != 1 &&
        sscanf(args, "{\"level\":%d}", &level) != 1) {
        snprintf(result, cap, "expected {\"level\":0-100}");
        return -1;
    }
    if (level < 0) {
        level = 0;
    } else if (level > 100) {
        level = 100;
    }

    /* Drive the PWM0 channel 0 devicetree node (PWM5 in v1.1
     * overlay). The devicetree label `shadow_pwm` resolves to
     * the channel configured in the overlay. */
    static const struct device *pwm_dev =
        DEVICE_DT_GET_OR(DT_NODELABEL(shadow_pwm), NULL);
    if (pwm_dev == NULL || !device_is_ready(pwm_dev)) {
        snprintf(result, cap,
                 "{\"ok\":true,\"level\":%d,\"driver\":\"pwm-stub\"}", level);
        return 0;
    }

    /* pwm_set() takes pulse-width in nanoseconds; we drive
     * 0-100% of a 1 ms period. The period is device-specific;
     * 0 means a dummy 1 ms default. */
    uint32_t period_usec = 1000;
    uint32_t pulse_usec = (uint32_t)level * period_usec / 100u;
    int rc = pwm_set(pwm_dev, 0, period_usec * 1000u, pulse_usec * 1000u, 0);
    if (rc != 0) {
        snprintf(result, cap, "{\"ok\":false,\"error\":\"pwm_set=%d\"}", rc);
        return -1;
    }
    snprintf(result, cap,
             "{\"ok\":true,\"level\":%d,\"pulse_usec\":%u}", level, pulse_usec);
    return 0;
}

/* --- JSON-RPC 2.0 helpers (minimal, hand-rolled) ------------------- */

/* Extract the string value for `key` (top-level "key":"value").
 * Returns 0 on success, -1 on not-found. */
static int json_get_string(const char *json, const char *key,
                           char *out, size_t cap)
{
    char pat[64];
    int n = snprintf(pat, sizeof(pat), "\"%s\":\"", key);
    if (n <= 0 || n >= (int)sizeof(pat)) {
        return -1;
    }
    const char *p = strstr(json, pat);
    if (p == NULL) {
        return -1;
    }
    p += n;
    const char *end = strchr(p, '"');
    if (end == NULL || (size_t)(end - p) >= cap) {
        return -1;
    }
    size_t len = (size_t)(end - p);
    memcpy(out, p, len);
    out[len] = '\0';
    return 0;
}

static int json_get_int(const char *json, const char *key, int *out)
{
    char pat[64];
    int n = snprintf(pat, sizeof(pat), "\"%s\":", key);
    if (n <= 0 || n >= (int)sizeof(pat)) {
        return -1;
    }
    const char *p = strstr(json, pat);
    if (p == NULL) {
        return -1;
    }
    p += n;
    while (*p == ' ') {
        p++;
    }
    char *endp;
    long v = strtol(p, &endp, 10);
    if (endp == p) {
        return -1;
    }
    *out = (int)v;
    return 0;
}

/* Extract the substring for the first occurrence of "key": {...}
 * in a flat JSON object. Returns the offset (after the opening
 * brace) and length up to the matching closing brace, accounting
 * for nested braces and string escaping. */
static int json_get_object(const char *json, const char *key,
                            const char **out, size_t *len)
{
    char pat[64];
    int n = snprintf(pat, sizeof(pat), "\"%s\":", key);
    if (n <= 0 || n >= (int)sizeof(pat)) {
        return -1;
    }
    const char *p = strstr(json, pat);
    if (p == NULL) {
        return -1;
    }
    p += n;
    while (*p == ' ') {
        p++;
    }
    if (*p != '{') {
        return -1;
    }
    p++;
    int depth = 1;
    bool in_string = false;
    bool escape = false;
    const char *start = p;
    while (*p != '\0' && depth > 0) {
        char c = *p;
        if (escape) {
            escape = false;
        } else if (c == '\\' && in_string) {
            escape = true;
        } else if (c == '"') {
            in_string = !in_string;
        } else if (!in_string) {
            if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    *out = start;
                    *len = (size_t)(p - start);
                    return 0;
                }
            }
        }
        p++;
    }
    return -1;
}

size_t shadow_io_list_tools_json(char *buf, size_t cap)
{
    size_t off = 0;
    int n = snprintf(buf + off, cap - off, "{\"tools\":[");
    if (n <= 0 || (size_t)n >= cap - off) {
        return 0;
    }
    off += (size_t)n;

    for (size_t i = 0; i < g_tool_count; i++) {
        const struct shadow_tool *t = &g_tools[i];
        const char *schema = t->input_schema_json != NULL ?
                             t->input_schema_json : "{}";

        n = snprintf(buf + off, cap - off,
                     "%s{\"name\":\"%s\",\"description\":\"%s\","
                     "\"inputSchema\":%s,\"userOnly\":%s}",
                     i == 0 ? "" : ",",
                     t->name,
                     t->description != NULL ? t->description : "",
                     schema,
                     t->user_only ? "true" : "false");
        if (n <= 0 || (size_t)n >= cap - off) {
            return 0;
        }
        off += (size_t)n;
    }

    n = snprintf(buf + off, cap - off, "]}");
    if (n <= 0 || (size_t)n >= cap - off) {
        return 0;
    }
    off += (size_t)n;
    return off;
}

/* Build a JSON-RPC 2.0 success response. `result` is the
 * JSON-encoded tool result. */
static size_t rpc_ok(int id, const char *result_json, char *buf, size_t cap)
{
    int n = snprintf(buf, cap,
                     "{\"jsonrpc\":\"2.0\",\"id\":%d,\"result\":%s}",
                     id, result_json != NULL ? result_json : "null");
    return n > 0 ? (size_t)n : 0;
}

static size_t rpc_err(int id, int code, const char *message,
                     char *buf, size_t cap)
{
    int n = snprintf(buf, cap,
                     "{\"jsonrpc\":\"2.0\",\"id\":%d,\"error\":{"
                     "\"code\":%d,\"message\":\"%s\"}}",
                     id, code, message != NULL ? message : "");
    return n > 0 ? (size_t)n : 0;
}

size_t shadow_io_invoke_mcp(const char *request, char *response, size_t cap)
{
    if (request == NULL || response == NULL || cap == 0) {
        return 0;
    }

    int id = 0;
    json_get_int(request, "id", &id);

    char method[32] = { 0 };
    if (json_get_string(request, "method", method, sizeof(method)) != 0) {
        return rpc_err(id, -32600, "missing method", response, cap);
    }

    if (strcmp(method, "initialize") == 0) {
        const char *rsp = "{\"protocolVersion\":\"2024-11-05\","
                          "\"capabilities\":{\"tools\":{}},"
                          "\"serverInfo\":{\"name\":\"shadow-esp32\","
                          "\"version\":\"0.0.1\"}}";
        return rpc_ok(id, rsp, response, cap);
    }

    if (strcmp(method, "tools/list") == 0) {
        char tools[2048];
        size_t n = shadow_io_list_tools_json(tools, sizeof(tools));
        if (n == 0) {
            return rpc_err(id, -32603, "tools/list overflow", response, cap);
        }
        return rpc_ok(id, tools, response, cap);
    }

    if (strcmp(method, "tools/call") == 0) {
        char name[64] = { 0 };
        if (json_get_string(request, "name", name, sizeof(name)) != 0) {
            return rpc_err(id, -32602, "missing params.name",
                            response, cap);
        }

        const char *args_ptr = NULL;
        size_t args_len = 0;
        if (json_get_object(request, "arguments", &args_ptr,
                              &args_len) != 0) {
            args_ptr = "{}";
            args_len = 2;
        }

        const struct shadow_tool *tool = NULL;
        for (size_t i = 0; i < g_tool_count; i++) {
            if (strcmp(g_tools[i].name, name) == 0) {
                tool = &g_tools[i];
                break;
            }
        }
        if (tool == NULL) {
            return rpc_err(id, -32601, "tool not found", response, cap);
        }

        char result[256];
        int rc = tool->invoke(args_ptr, result, sizeof(result));
        if (rc < 0) {
            /* Treat negative as a tool-reported error: include
             * the message in an MCP error. */
            return rpc_err(id, -32000,
                            rc == -1 ? result : "tool error",
                            response, cap);
        }
        return rpc_ok(id, result, response, cap);
    }

    return rpc_err(id, -32601, "method not found", response, cap);
}

/* --- Task start ----------------------------------------------------- */

static void register_v1_tools(void)
{
    static const struct shadow_tool tools[] = {
        {
            .name = "self.io.gpio_set",
            .description = "Set a GPIO pin high (1) or low (0).",
            .input_schema_json =
                "{\"type\":\"object\","
                "\"properties\":{\"pin\":{\"type\":\"integer\"},"
                "\"value\":{\"type\":\"integer\"}},"
                "\"required\":[\"pin\",\"value\"]}",
            .user_only = false,
            .invoke = tool_io_gpio_set,
        },
        {
            .name = "self.io.gpio_get",
            .description = "Read a GPIO pin (returns 0 or 1).",
            .input_schema_json =
                "{\"type\":\"object\","
                "\"properties\":{\"pin\":{\"type\":\"integer\"}},"
                "\"required\":[\"pin\"]}",
            .user_only = false,
            .invoke = tool_io_gpio_get,
        },
        {
            .name = "self.light.set_rgb",
            .description = "Set the on-board RGB LED color (r/g/b: 0-255).",
            .input_schema_json =
                "{\"type\":\"object\","
                "\"properties\":{\"r\":{\"type\":\"integer\"},"
                "\"g\":{\"type\":\"integer\"},"
                "\"b\":{\"type\":\"integer\"}},"
                "\"required\":[\"r\",\"g\",\"b\"]}",
            .user_only = false,
            .invoke = tool_light_set_rgb,
        },
        {
            .name = "self.light.set_brightness",
            .description = "Set the on-board LED brightness (0-100).",
            .input_schema_json =
                "{\"type\":\"object\","
                "\"properties\":{\"level\":{\"type\":\"integer\"}},"
                "\"required\":[\"level\"]}",
            .user_only = false,
            .invoke = tool_light_set_brightness,
        },
        {
            .name = "self.system.reboot",
            .description = "Reboot the device. Privileged.",
            .input_schema_json = "{\"type\":\"object\"}",
            .user_only = true,
            .invoke = tool_system_reboot,
        },
        {
            .name = "self.sensor.read",
            .description = "Read one byte from the I²C sensor at "
                           "the devicetree-declared address "
                           "(shadow_sensor, 0x68).",
            .input_schema_json =
                "{\"type\":\"object\","
                "\"properties\":{\"reg\":{\"type\":\"integer\"}},"
                "\"required\":[\"reg\"]}",
            .user_only = false,
            .invoke = tool_sensor_read,
        },
        {
            .name = "self.event.danmaku",
            .description = "Forward a recognized live-stream comment "
                           "(OCR result or chat message) from the "
                           "phone to shadow-esp32. The text is logged "
                           "and triggers the LED heartbeat; a future "
                           "commit will forward it to cortex as a "
                           "user-utterance event so the LLM can "
                           "respond to it.",
            .input_schema_json =
                "{\"type\":\"object\","
                "\"properties\":{\"text\":{\"type\":\"string\"},"
                "\"user\":{\"type\":\"string\"}},"
                "\"required\":[\"text\"]}",
            .user_only = false,
            .invoke = tool_event_danmaku,
        },
    };

    for (size_t i = 0; i < ARRAY_SIZE(tools); i++) {
        int rc = shadow_io_register_tool(&tools[i]);
        if (rc != 0) {
            LOG_ERR("failed to register %s", tools[i].name);
        }
    }
}

static void io_task_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);

    LOG_INF("io_task started; registering v1 tools");
    register_v1_tools();
    LOG_INF("io_task ready (%zu tools registered)", g_tool_count);

    /* v1: io_task is a service task — it does not run any
     * periodic work. Once dialog_task v2 brings up the WebRTC
     * data channel, it will route incoming JSON-RPC frames to
     * `shadow_io_invoke_mcp()` via a registered callback. */
    while (1) {
        k_sleep(K_FOREVER);
    }
}

void shadow_io_task_start(void)
{
    k_thread_create(&io_thread, io_stack,
                    K_THREAD_STACK_SIZEOF(io_stack),
                    io_task_fn, NULL, NULL, NULL,
                    SHADOW_IO_PRIORITY, 0, K_NO_WAIT);
    k_thread_name_set(&io_thread, "io");
}