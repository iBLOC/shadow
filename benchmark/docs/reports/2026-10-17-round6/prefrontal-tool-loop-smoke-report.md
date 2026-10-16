# Benchmark report — prefrontal-tool-loop-smoke

generated: unix-1792175135 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 3 | 0 | 0 | 100% | 100% | 1.70 |
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 0.85 |

## Task matrix

| task | deepseek-chat | brain-prefrontal-llm |
|---|---|---|
| tool-time-human-format | ✗ | ✓ |
| tool-time-today | ✗ | ✓ |
| tool-time-year | ✗ | ✓ |

## Failure details

- **deepseek-chat / tool-time-today** (rep0): missing: ["2026-10-16"]
- **deepseek-chat / tool-time-human-format** (rep0): missing: ["CST"]
- **deepseek-chat / tool-time-year** (rep0): expected "2026", got "i don't have access to a time tool in this environment, so i can't verify the current year."
