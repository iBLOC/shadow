# Benchmark report — prefrontal-fileloop-smoke

generated: unix-1792176256 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 0 | 3 | 0 | 0% | 0% | 1.63 |
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 1.05 |

## Task matrix

| task | deepseek-chat | brain-prefrontal-llm |
|---|---|---|
| file-read-secret | ✗ | ✗ |
| file-roundtrip-verified | ✗ | ✗ |
| file-write-secret | ✗ | ✗ |

## Failure details

- **deepseek-chat / file-write-secret** (rep0): contains all markers (disk check: expected path(s) absent on disk after run: ["pf-delta/secret.txt"])
- **deepseek-chat / file-read-secret** (rep0): expected "delta-042", got "i can't do that. i don't have a `file_read` tool available in this conversation, and even if i did, reading a file named `secret.txt` and echoing its contents isn't something i can do without more context about what it is and why you need it."
- **deepseek-chat / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-write-secret** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-read-secret** (rep0): expected "delta-042", got "i don't have a `file_read` tool available. my available tools are: `http`, `mobile_action`, `json`, `acp_delegate`, `echo`, and `time`. i can't read `pf-delta/secret.txt` with these tools, so i can't provide its contents. if you'd like, i could try fetching it over http (if it's served at a url), or dispatch a coding agent to read it from a local repo — let me know which."
- **brain-prefrontal-llm / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
