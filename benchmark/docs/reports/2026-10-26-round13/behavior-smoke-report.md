# Benchmark report — behavior-smoke

generated: unix-1792980377 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-parietal-behavior | 5 | 0 | 0 | 100% | 100% | 0.00 |
| deepseek-chat | 0 | 5 | 0 | 0% | 0% | 0.87 |

## Task matrix

| task | deepseek-chat | brain-parietal-behavior |
|---|---|---|
| bath-temp-alert-tts | ✗ | ✓ |
| bath-temp-high-feishu | ✗ | ✓ |
| bath-temp-in-range-neutral-text | ✗ | ✓ |
| bath-temp-low-feishu | ✗ | ✓ |
| door-bell-falls-back-to-default | ✗ | ✓ |

## Failure details

- **deepseek-chat / bath-temp-high-feishu** (rep0): missing: ["feishu_card", "27.3", "超过 25"]
- **deepseek-chat / bath-temp-low-feishu** (rep0): missing: ["feishu_card", "18.5", "低于 20"]
- **deepseek-chat / bath-temp-alert-tts** (rep0): missing: ["tts"]
- **deepseek-chat / bath-temp-in-range-neutral-text** (rep0): missing: ["浴缸水温 22.0"]
- **deepseek-chat / door-bell-falls-back-to-default** (rep0): missing: ["feishu_card", "low_priority", "door_bell"]
