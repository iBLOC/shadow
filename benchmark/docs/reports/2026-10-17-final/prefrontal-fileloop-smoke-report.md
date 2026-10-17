# Benchmark report — prefrontal-fileloop-smoke

generated: unix-1792198742 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-parietal-behavior | 0 | 3 | 0 | 0% | 0% | 0.00 |
| brain-prefrontal-llm | 0 | 3 | 0 | 0% | 0% | 1.54 |
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 0.67 |
| mimo-flash | 0 | 3 | 0 | 0% | 0% | 2.57 |

## Task matrix

| task | deepseek-chat | mimo-flash | brain-parietal-behavior | brain-prefrontal-llm |
|---|---|---|---|---|
| file-read-secret | ✗ | ✗ | ✗ | ✗ |
| file-roundtrip-verified | ✗ | ✗ | ✗ | ✗ |
| file-write-secret | ✗ | ✗ | ✗ | ✗ |

## Failure details

- **deepseek-chat / file-write-secret** (rep0): contains all markers (disk check: expected path(s) absent on disk after run: ["pf-delta/secret.txt"])
- **deepseek-chat / file-read-secret** (rep0): expected "delta-042", got "i can't read that file because no `file_read` tool is available to me here, and i have no access to a filesystem path like `pf-delta/secret.txt`. if you paste the file's contents or provide the tool, i can help."
- **deepseek-chat / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **mimo-flash / file-write-secret** (rep0): contains all markers (disk check: expected path(s) absent on disk after run: ["pf-delta/secret.txt"])
- **mimo-flash / file-read-secret** (rep0): hallucinated action: answer narrates '"file_read"' but no tool call was made
- **mimo-flash / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **brain-parietal-behavior / file-write-secret** (rep0): contains all markers (disk check: expected path(s) absent on disk after run: ["pf-delta/secret.txt"])
- **brain-parietal-behavior / file-read-secret** (rep0): expected "delta-042", got "channel=feishu_card | [use file_read to read pf-delta/secret.txt and answer with exactly the content of the file, nothing else.]"
- **brain-parietal-behavior / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **brain-prefrontal-llm / file-write-secret** (rep0): contains all markers (disk check: expected path(s) absent on disk after run: ["pf-delta/secret.txt"])
- **brain-prefrontal-llm / file-read-secret** (rep0): expected "delta-042", got "i don't have a `file_read` tool available. my available tools are: `http`, `mobile_action`, `json`, `acp_delegate`, `echo`, and `time`. i can't read `pf-delta/secret.txt` with these tools, so i can't provide its contents. if you'd like, i can try fetching it over http (if you give me a url) or delegate the task to a coding agent that has filesystem access."
- **brain-prefrontal-llm / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
