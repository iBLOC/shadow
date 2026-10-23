# Benchmark report — prefrontal-tool-loop-smoke

generated: unix-1792750189 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 2 | 1 | 0 | 67% | 67% | 1.35 |
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 0.87 |
| mimo-flash | 0 | 3 | 0 | 0% | 0% | 3.19 |

## Task matrix

| task | deepseek-chat | mimo-flash | brain-prefrontal-llm |
|---|---|---|---|
| tool-time-human-format | ✗ | ✗ | ✓ |
| tool-time-today | ✗ | ✗ | ✗ |
| tool-time-year | ✗ | ✗ | ✓ |

## Failure details

- **deepseek-chat / tool-time-today** (rep0): missing: ["2026-10-16"]
- **deepseek-chat / tool-time-human-format** (rep0): missing: ["CST"]
- **deepseek-chat / tool-time-year** (rep0): expected "2026", got "i can't retrieve the current year because no time tool is available in this conversation."
- **mimo-flash / tool-time-today** (rep0): missing: ["2026-10-16"]
- **mimo-flash / tool-time-human-format** (rep0): missing: ["CST"]
- **mimo-flash / tool-time-year** (rep0): expected "2026", got "i don't have a time tool available in this conversation, so i can't retrieve the current year."
- **brain-prefrontal-llm / tool-time-today** (rep0): missing: ["2026-10-16"]
