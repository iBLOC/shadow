# Benchmark report — prefrontal-fileloop-smoke

generated: unix-1792750211 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 0 | 3 | 0 | 0% | 0% | 1.35 |
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 0.83 |
| mimo-flash | 0 | 3 | 0 | 0% | 0% | 4.98 |

## Task matrix

| task | deepseek-chat | mimo-flash | brain-prefrontal-llm |
|---|---|---|---|
| file-read-secret | ✗ | ✗ | ✗ |
| file-roundtrip-verified | ✗ | ✗ | ✗ |
| file-write-secret | ✗ | ✗ | ✗ |

## Failure details

- **deepseek-chat / file-write-secret** (rep0): contains all markers (disk check: expected path(s) absent on disk after run: ["pf-delta/secret.txt"])
- **deepseek-chat / file-read-secret** (rep0): expected "delta-042", got "i don't have access to file reading tools in this conversation, and i can't retrieve files from paths like `pf-delta/secret.txt`. if you paste the file's contents here, i can help you with them."
- **deepseek-chat / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **mimo-flash / file-write-secret** (rep0): missing: ["DELTA-042"]
- **mimo-flash / file-read-secret** (rep0): expected "delta-042", got "i don't have a `file_read` tool available in this session, so i can't read `pf-delta/secret.txt`. the available tools are finance-related only (company_news, company_search, etc.) and none can read files."
- **mimo-flash / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-write-secret** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-read-secret** (rep0): expected "delta-042", got "i don't have a `file_read` tool available. my available tools are: `http`, `mobile_action`, `json`, `acp_delegate`, `echo`, and `time`. if you can tell me where the file is accessible (e.g., a url for the `http` tool, or a path i could have a coding agent read via `acp_delegate`), i can retrieve it. otherwise, would you like me to paste the file contents here?"
- **brain-prefrontal-llm / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
