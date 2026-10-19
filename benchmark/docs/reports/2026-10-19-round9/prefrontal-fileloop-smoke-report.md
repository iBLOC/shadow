# Benchmark report — prefrontal-fileloop-smoke

generated: unix-1792416777 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 0.86 |
| mimo-flash | 0 | 3 | 0 | 0% | 0% | 7.79 |

## Task matrix

| task | deepseek-chat | mimo-flash |
|---|---|---|
| file-read-secret | ✗ | ✗ |
| file-roundtrip-verified | ✗ | ✗ |
| file-write-secret | ✗ | ✗ |

## Failure details

- **deepseek-chat / file-write-secret** (rep0): contains all markers (disk check: expected path(s) absent on disk after run: ["pf-delta/secret.txt"])
- **deepseek-chat / file-read-secret** (rep0): expected "delta-042", got "file_read is not available in this environment, so i cannot read pf-delta/secret.txt."
- **deepseek-chat / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
- **mimo-flash / file-write-secret** (rep0): contains all markers (disk check: expected path(s) absent on disk after run: ["pf-delta/secret.txt"])
- **mimo-flash / file-read-secret** (rep0): expected "delta-042", got "<tool_call><function=execute_bash><parameter=command>cat pf-delta/secret.txt 2>&1 || ls pf-delta 2>&1</parameter></function></tool_call>"
- **mimo-flash / file-roundtrip-verified** (rep0): missing: ["DELTA-042"]
