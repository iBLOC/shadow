# Benchmark report — prefrontal-fileloop-smoke

generated: unix-1792174361 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 0 | 3 | 0 | 0% | 0% | 1.09 |
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 0.88 |

## Task matrix

| task | deepseek-chat | brain-prefrontal-llm |
|---|---|---|
| file-read-secret | ✗ | ✗ |
| file-roundtrip-verified | ✗ | ✗ |
| file-write-secret | ✗ | ✗ |

## Failure details

- **deepseek-chat / file-write-secret** (rep0): contains all markers (disk check: expected path(s) absent on disk after run: ["pf-delta/secret.txt"])
- **deepseek-chat / file-read-secret** (rep0): expected "delta-042", got "i don't have access to a `file_read` tool or any file system in this conversation, so i can't read `pf-delta/secret.txt`. if you paste the file's contents, i can help with whatever you need."
- **deepseek-chat / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-write-secret** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-read-secret** (rep0): expected "delta-042", got "i don't have a `file_read` tool available, so i can't read that file. my available tools are: `http`, `mobile_action`, `json`, `acp_delegate`, `echo`, and `time`. if you'd like, i can try fetching the file over http (if you provide a url), or dispatch the task to a coding agent that has filesystem access."
- **brain-prefrontal-llm / file-roundtrip-verified** (rep0): hallucinated action: answer narrates 'tools i have access to are' but no tool call was made
