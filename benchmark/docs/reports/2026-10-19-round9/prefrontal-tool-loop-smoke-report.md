# Benchmark report — prefrontal-tool-loop-smoke

generated: unix-1792416743 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| deepseek-chat | 0 | 3 | 0 | 0% | 0% | 0.73 |
| mimo-flash | 0 | 3 | 0 | 0% | 0% | 14.01 |

## Task matrix

| task | deepseek-chat | mimo-flash |
|---|---|---|
| tool-time-human-format | ✗ | ✗ |
| tool-time-today | ✗ | ✗ |
| tool-time-year | ✗ | ✗ |

## Failure details

- **deepseek-chat / tool-time-today** (rep0): missing: ["2026-10-16"]
- **deepseek-chat / tool-time-human-format** (rep0): missing: ["CST"]
- **deepseek-chat / tool-time-year** (rep0): expected "2026", got "i can't verify the current year because no time tool is available in this conversation."
- **mimo-flash / tool-time-today** (rep0): missing: ["2026-10-16"]
- **mimo-flash / tool-time-human-format** (rep0): missing: ["CST"]
- **mimo-flash / tool-time-year** (rep0): expected "2026", got "<tool_call_36a8b94076c558de0938f7e4f3cd4f18c5490ca0><function=bash><parameter=command>date +%y</parameter><parameter=description>get current year</parameter></function></tool_call_36a8b94076c558de0938f7e4f3cd4f18c5490ca0>"
