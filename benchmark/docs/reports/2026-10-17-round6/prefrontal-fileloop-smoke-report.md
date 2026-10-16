# Benchmark report — prefrontal-fileloop-smoke

generated: unix-1792175087 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 0 | 3 | 0 | 0% | 0% | 1.58 |
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 0.85 |

## Task matrix

| task | deepseek-chat | brain-prefrontal-llm |
|---|---|---|
| file-read-secret | ✗ | ✗ |
| file-roundtrip-verified | ✗ | ✗ |
| file-write-secret | ✗ | ✗ |

## Failure details

- **deepseek-chat / file-write-secret** (rep0): contains all markers (disk check: expected path(s) absent on disk after run: ["pf-delta/secret.txt"])
- **deepseek-chat / file-read-secret** (rep0): expected "delta-042", got "i'll read the file for you. <tool_call> {\"name\": \"file_read\", \"arguments\": {\"path\": \"pf-delta/secret.txt\"}} </tool_call>"
- **deepseek-chat / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-write-secret** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-read-secret** (rep0): hallucinated action: answer narrates 'tools i have access to are' but no tool call was made
- **brain-prefrontal-llm / file-roundtrip-verified** (rep0): hallucinated action: answer narrates 'tools i have access to are' but no tool call was made
