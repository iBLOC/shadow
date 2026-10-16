# Benchmark report — prefrontal-tool-loop-smoke

generated: unix-1792174475 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 3 | 0 | 0 | 100% | 100% | 1.46 |
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 0.75 |

## Task matrix

| task | deepseek-chat | brain-prefrontal-llm |
|---|---|---|
| tool-time-human-format | ✗ | ✓ |
| tool-time-today | ✗ | ✓ |
| tool-time-year | ✗ | ✓ |

## Failure details

- **deepseek-chat / tool-time-today** (rep0): missing: ["2026-10-16"]
- **deepseek-chat / tool-time-human-format** (rep0): missing: ["CST"]
- **deepseek-chat / tool-time-year** (rep0): expected "2026", got "i don't have access to a time tool in this conversation, so i can't check the current date. if you can enable the time tool or tell me today's date, i'll give you the year."
