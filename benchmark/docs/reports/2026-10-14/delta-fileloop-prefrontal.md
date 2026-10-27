# Benchmark report — prefrontal-fileloop-smoke

generated: unix-1792132043 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 3 | 0 | 0 | 100% | 100% | 2.01 |
| deepseek-chat | 1 | 2 | 0 | 33% | 33% | 0.94 |

## Task matrix

| task | deepseek-chat | brain-prefrontal-llm |
|---|---|---|
| file-read-secret | ✗ | ✓ |
| file-roundtrip-verified | ✗ | ✓ |
| file-write-secret | ✓ | ✓ |

## Failure details

- **deepseek-chat / file-read-secret** (rep0): expected "delta-042", got "i'll read the file for you. <tool_call> {\"name\": \"file_read\", \"arguments\": {\"path\": \"pf-delta/secret.txt\"}} </tool_call>"
- **deepseek-chat / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
