# Benchmark report — prefrontal-fileloop-smoke

generated: unix-1792174602 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 0 | 3 | 0 | 0% | 0% | 1.84 |
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 0.93 |

## Task matrix

| task | deepseek-chat | brain-prefrontal-llm |
|---|---|---|
| file-read-secret | ✗ | ✗ |
| file-roundtrip-verified | ✗ | ✗ |
| file-write-secret | ✗ | ✗ |

## Failure details

- **deepseek-chat / file-write-secret** (rep0): contains all markers (disk check: expected path(s) absent on disk after run: ["pf-delta/secret.txt"])
- **deepseek-chat / file-read-secret** (rep0): expected "delta-042", got "i don't have access to a `file_read` tool in this environment, so i can't read `pf-delta/secret.txt`. if you paste the file contents or provide the tool, i can help."
- **deepseek-chat / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-write-secret** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-read-secret** (rep0): hallucinated action: answer narrates 'tools i have access to are' but no tool call was made
- **brain-prefrontal-llm / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
