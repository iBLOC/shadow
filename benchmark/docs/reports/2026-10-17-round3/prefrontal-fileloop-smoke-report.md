# Benchmark report — prefrontal-fileloop-smoke

generated: unix-1792172537 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 0 | 3 | 0 | 0% | 0% | 1.77 |
| deepseek-chat | 1 | 2 | 0 | 33% | 33% | 0.84 |

## Task matrix

| task | deepseek-chat | brain-prefrontal-llm |
|---|---|---|
| file-read-secret | ✗ | ✗ |
| file-roundtrip-verified | ✗ | ✗ |
| file-write-secret | ✓ | ✗ |

## Failure details

- **deepseek-chat / file-read-secret** (rep0): expected "delta-042", got "i'll read the file for you. <tool_call> {\"name\": \"file_read\", \"arguments\": {\"path\": \"pf-delta/secret.txt\"}} </tool_call>"
- **deepseek-chat / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-write-secret** (rep0): hallucinated action: answer narrates 'i wrote ' but no tool call was made
- **brain-prefrontal-llm / file-read-secret** (rep0): expected "delta-042", got "i don't have a `file_read` tool available. my available tools are: `http`, `mobile_action`, `json`, `acp_delegate`, `echo`, and `time`. i can't read `pf-delta/secret.txt` with those tools directly. if you'd like, i could try fetching it over http (if it's served somewhere) or have a coding agent read it via `acp_delegate` — just let me know the intended path/url."
- **brain-prefrontal-llm / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
