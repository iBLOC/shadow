# Benchmark report — prefrontal-tool-loop-smoke

generated: unix-1792198722 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-parietal-behavior | 0 | 3 | 0 | 0% | 0% | 0.00 |
| brain-prefrontal-llm | 2 | 1 | 0 | 67% | 67% | 1.32 |
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 0.69 |
| mimo-flash | 0 | 3 | 0 | 0% | 0% | 3.55 |

## Task matrix

| task | deepseek-chat | mimo-flash | brain-parietal-behavior | brain-prefrontal-llm |
|---|---|---|---|---|
| tool-time-human-format | ✗ | ✗ | ✗ | ✓ |
| tool-time-today | ✗ | ✗ | ✗ | ✗ |
| tool-time-year | ✗ | ✗ | ✗ | ✓ |

## Failure details

- **deepseek-chat / tool-time-today** (rep0): missing: ["2026-10-16"]
- **deepseek-chat / tool-time-human-format** (rep0): missing: ["CST"]
- **deepseek-chat / tool-time-year** (rep0): expected "2026", got "i don't have access to a time tool in this conversation, so i can't verify the current year."
- **mimo-flash / tool-time-today** (rep0): missing: ["2026-10-16"]
- **mimo-flash / tool-time-human-format** (rep0): missing: ["CST"]
- **mimo-flash / tool-time-year** (rep0): expected "2026", got "2025"
- **brain-parietal-behavior / tool-time-today** (rep0): missing: ["2026-10-16"]
- **brain-parietal-behavior / tool-time-human-format** (rep0): missing: ["CST"]
- **brain-parietal-behavior / tool-time-year** (rep0): expected "2026", got "channel=feishu_card | [what year is it right now? use the time tool. answer with just the year.]"
- **brain-prefrontal-llm / tool-time-today** (rep0): missing: ["2026-10-16"]
