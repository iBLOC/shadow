# Benchmark report — l4-junk-body-smoke

generated: unix-1792750218 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 0 | 1 | 0 | 0% | 0% | 1.23 |
| deepseek-chat | 0 | 1 | 0 | 0% | 0% | 0.85 |
| mimo-flash | 0 | 1 | 0 | 0% | 0% | 4.95 |

## Task matrix

| task | deepseek-chat | mimo-flash | brain-prefrontal-llm |
|---|---|---|---|
| file-l4-junk-body-validation | ✗ | ✗ | ✗ |

## Failure details

- **deepseek-chat / file-l4-junk-body-validation** (rep0): expected "expected-marker-delta-042", got "i can't read files directly. please paste the content of `pf-delta/junk.txt` and i'll return it exactly as provided."
- **mimo-flash / file-l4-junk-body-validation** (rep0): expected "expected-marker-delta-042", got "i don't have file access in this conversation, so i can't read `pf-delta/junk.txt`. no tools were provided to me for reading files, and the file contents weren't included in your message. if you paste the file's content here, i can repeat it back to you exactly. alternatively, if the file exists in the working directory of an agent with file tools, re-run the request there."
- **brain-prefrontal-llm / file-l4-junk-body-validation** (rep0): expected "expected-marker-delta-042", got "i don't have a file-reading tool available — my tools are limited to http requests, mobile device actions, json formatting, delegating to coding agents, echo, and time. none of these can read a local file directly. a couple of options: 1. if you can paste the file's content, i'll echo it back exactly. 2. if the file is accessible via a url, give me the url and i can fetch it with an http get. 3. i could dispatch the task to a coding agent (e.g., `opencode`) which may have shell access to read `pf-delta/junk.txt` — though note that would run in its own environment, not necessarily yours. let me know which you'd prefer."
