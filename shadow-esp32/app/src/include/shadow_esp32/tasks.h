/* SPDX-License-Identifier: Apache-2.0 */
#ifndef SHADOW_ESP32_TASKS_H
#define SHADOW_ESP32_TASKS_H

/* Stack / priority for the dialog_task. Configured via Kconfig so
 * each board variant can tune the budget. */
#ifndef SHADOW_DIALOG_STACK_SIZE
#define SHADOW_DIALOG_STACK_SIZE 16384
#endif
#ifndef SHADOW_DIALOG_PRIORITY
#define SHADOW_DIALOG_PRIORITY 5
#endif

#ifndef SHADOW_IO_STACK_SIZE
#define SHADOW_IO_STACK_SIZE 4096
#endif
#ifndef SHADOW_IO_PRIORITY
#define SHADOW_IO_PRIORITY 7
#endif

#ifndef SHADOW_NET_STACK_SIZE
#define SHADOW_NET_STACK_SIZE 4096
#endif
#ifndef SHADOW_NET_PRIORITY
#define SHADOW_NET_PRIORITY 6
#endif

#ifndef SHADOW_LED_STACK_SIZE
#define SHADOW_LED_STACK_SIZE 2048
#endif
#ifndef SHADOW_LED_PRIORITY
#define SHADOW_LED_PRIORITY 9
#endif

/* Public entry points. Implemented in their own translation units;
 * declared here so `main.c` does not depend on the individual
 * headers as the implementation fills in. */
void shadow_dialog_task_start(void);
void shadow_io_task_start(void);
void shadow_net_task_start(void);
void shadow_led_task_start(void);

/* Cross-task signals. net_task posts `shadow_net_wifi_up` after a
 * successful Wi-Fi association; dialog_task waits on it before
 * opening the WebRTC signaling WebSocket. */
#include <zephyr/kernel.h>
extern struct k_sem shadow_net_wifi_up;

#endif /* SHADOW_ESP32_TASKS_H */