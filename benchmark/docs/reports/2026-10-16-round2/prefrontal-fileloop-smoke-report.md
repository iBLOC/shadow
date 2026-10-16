# Benchmark report — prefrontal-fileloop-smoke

generated: unix-1792162856 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 0 | 3 | 0 | 0% | 0% | 1.56 |
| deepseek-chat | 1 | 2 | 0 | 33% | 33% | 1.14 |

## Task matrix

| task | deepseek-chat | brain-prefrontal-llm |
|---|---|---|
| file-read-secret | ✗ | ✗ |
| file-roundtrip-verified | ✗ | ✗ |
| file-write-secret | ✓ | ✗ |

## Failure details

- **deepseek-chat / file-read-secret** (rep0): expected "delta-042", got "i don't have access to a `file_read` tool in this environment, so i can't read `pf-delta/secret.txt` or provide its contents."
- **deepseek-chat / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-write-secret** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-read-secret** (rep0): expected "delta-042", got "i don't have a `file_read` tool available. the tools i have access to are: `http`, `mobile_action`, `json`, `acp_delegate`, `echo`, and `time`. if you'd like, i can try to read the file another way — for example, via an http request if it's served over a url, or by delegating to a coding agent that has filesystem access. let me know which you'd prefer."
- **brain-prefrontal-llm / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
