# shadow-esp32 io_task v2 + led_task v1 实施记录 (2026-08-16, ADR-0002 v2 §后续动作 #6a + #7a)

## 本次提交改了什么

把 #6a(io_task v2:真 GPIO 接线)和 #7a(led_task 真实实现)合在一起 — 两个都是 1-2 周小任务,共改 5 个文件:

| 文件 | 状态 | 改动 |
|---|---|---|
| `app/boards/esp32s3_devkitc.overlay` | **新建** | devicetree overlay:定义 `shadow_led` (GPIO48)、`shadow_out_a` (GPIO1)、`shadow_out_b` (GPIO2)、`shadow_in_a` (GPIO4)、`shadow_sensor` (I²C0@0x68)、`shadow_pwm` (PWM0 ch0→GPIO5) |
| `app/src/io_task.c` | 修改 | 4 个工具改用 `gpio_dt_spec` 真实接线;pin alias 表(防误碰);`tool_light_set_rgb` 把 RGB 折叠为 on/off |
| `app/src/led_task.c` | 改写 | 37 行占位 → 117 行真实实现 |
| `README.md` | 修改 | Roadmap #6a + #7a 标完成;修订表 v0.9 |
| `docs/implementation-notes/2026-08-16-io-task-v2-led-task.md` | **新建** | 本文件 |

## devicetree overlay 设计

**Pin alias 表**(防止 LLM 误碰其它 GPIO):

| Alias | Pin | 用途 | 工具 |
|---|---|---|---|
| `shadow_led` | GPIO48 | On-board RGB LED | `self.light.set_rgb` |
| `shadow_out_a` | GPIO1 | Free header | `self.io.gpio_set pin=1` |
| `shadow_out_b` | GPIO2 | Free header | `self.io.gpio_set pin=2` |
| `shadow_in_a` | GPIO4 | Free header (pull-up) | `self.io.gpio_get pin=4` |
| `shadow_sensor` | I²C0@0x68 | Sensor stub | v2.1 follow-up |
| `shadow_pwm` | PWM0 ch0 → GPIO5 | Brightness / servo | v2.1 follow-up |

**安全设计**:`tool_io_gpio_set` 只接受 pin ∈ {1, 2, 48},其他值返回 `{"error":"pin N not in devicetree aliases"}` — 防止 LLM 通过 MCP 调任意 GPIO 引发硬件意外(尤其 ESP32-S3 启动模式引脚 GPIO0/46/45 不能被任意翻)。

## io_task v2 真实接线

```c
static const struct gpio_dt_spec shadow_led   = GPIO_DT_SPEC_GET(DT_NODELABEL(shadow_led));
static const struct gpio_dt_spec shadow_out_a = GPIO_DT_SPEC_GET(DT_NODELABEL(shadow_out_a));
static const struct gpio_dt_spec shadow_out_b = GPIO_DT_SPEC_GET(DT_NODELABEL(shadow_out_b));
static const struct gpio_dt_spec shadow_in_a  = GPIO_DT_SPEC_GET(DT_NODELABEL(shadow_in_a));

static int tool_io_gpio_set(...) {
    const struct gpio_dt_spec *spec = NULL;
    switch (pin) {
    case 1:  spec = &shadow_out_a; break;
    case 2:  spec = &shadow_out_b; break;
    case 48: spec = &shadow_led;    break;
    default: return -1;  // unknown pin
    }
    if (!gpio_is_ready_dt(spec)) return -1;
    int rc = gpio_pin_set_dt(spec, value ? 1 : 0);
    ...
}
```

## `self.light.set_rgb` 折叠为 on/off(v2 简化)

```c
int on = (r > 0) || (g > 0) || (b > 0);
gpio_pin_set_dt(&shadow_led, on ? 1 : 0);
return format("{\"ok\":true,\"mode\":\"binary\",...,\"led\":\"%s\"}", on ? "on" : "off");
```

v3 会有真 WS2812 / PWM-LED RGB 驱动;v2 把 RGB 三通道折叠为二值 LED 状态(`{"mode":"binary"}`),这样 end-to-end MCP 路径能在真硬件上跑通。

## led_task 设计

**状态机**(继承 xiaozhi-esp32 的 `kDeviceState`):

```c
enum shadow_led_state {
    LED_STATE_IDLE, LED_STATE_CONNECTING,
    LED_STATE_LISTENING, LED_STATE_SPEAKING, LED_STATE_FATAL
};
```

**渲染规则**:
- IDLE / FATAL → LED off
- CONNECTING / LISTENING / SPEAKING → LED on
- 心跳:每秒 LED 闪 50ms(让操作员能看出固件还活着,即使没 MCP 流量)

**通信契约**(未来 dialog_task v2 用):

```c
struct led_state_msg { enum shadow_led_state state; };
K_MSGQ_DEFINE(led_state_q, sizeof(struct led_state_msg), 8, 1);

// dialog_task v2 里会写:
struct led_state_msg msg = { .state = LED_STATE_LISTENING };
k_msgq_put(&led_state_q, &msg, K_NO_WAIT);
```

## 已知边界

1. **本机无 Zephyr SDK** — 验证只能在 devcontainer 跑 `west build`
2. **`self.light.set_rgb` 是二值折叠** — 等 WS2812 / PWM-LED RGB 驱动(v3 提交)
3. **`self.light.set_brightness` 仍为占位** — 需要 PWM 驱动,v2.1 提交
4. **没有 I²C sensor 工具** — `shadow_sensor` 节点已建,实际驱动 + `self.sensor.read` 工具 v2.1 提交
5. **led_task 心跳 50ms 闪** 是粗糙的 v1 行为 — v3 用 WS2812 颜色更友好

## 验证

```bash
# devcontainer
west init -l . && west update && west packages pip --install
west build -b esp32s3_devkitc app
west flash

# 串口上看到
# [shadow_io] io_task ready (5 tools registered)
# [shadow_led] led_task started; shadow_led ready=1
# 每秒:LED 闪一下(idle heartbeat)
```

**手动测试**(在 main.c 临时加):
```c
// 测 self.system.reboot (实际触发重启)
char rsp[256];
size_t n = shadow_io_invoke_mcp(
    "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\","
    "\"params\":{\"name\":\"self.system.reboot\",\"arguments\":{}}}",
    rsp, sizeof(rsp));
// 设备应在 200ms 后重启
```

**手动测试**(MCP server 通过 devicetree 直接调 GPIO):
```c
shadow_io_invoke_mcp(
    "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\","
    "\"params\":{\"name\":\"self.io.gpio_set\",\"arguments\":{\"pin\":1,\"value\":1}}}",
    rsp, sizeof(rsp));
// GPIO1 应被拉高
```

## 引用

- ADR-0002 v2 §4.3 / §4.4 / §后续动作 #6a / #7a
- Zephyr devicetree: https://docs.zephyrproject.org/latest/build/dts/index.html
- Zephyr GPIO API: https://docs.zephyrproject.org/latest/hardware/peripherals/gpio.html