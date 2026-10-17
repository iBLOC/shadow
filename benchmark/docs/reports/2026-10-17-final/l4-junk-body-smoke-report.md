# Benchmark report — l4-junk-body-smoke

generated: unix-1792198756 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-parietal-behavior | 0 | 1 | 0 | 0% | 0% | 0.00 |
| brain-prefrontal-llm | 0 | 1 | 0 | 0% | 0% | 7.20 |
| deepseek-chat | 0 | 1 | 0 | 0% | 0% | 0.72 |
| mimo-flash | 0 | 1 | 0 | 0% | 0% | 5.52 |

## Task matrix

| task | deepseek-chat | mimo-flash | brain-parietal-behavior | brain-prefrontal-llm |
|---|---|---|---|---|
| file-l4-junk-body-validation | ✗ | ✗ | ✗ | ✗ |

## Failure details

- **deepseek-chat / file-l4-junk-body-validation** (rep0): expected "expected-marker-delta-042", got "i'll read the requested file and provide its content. ```path:pf-delta/junk.txt placeholder ```"
- **mimo-flash / file-l4-junk-body-validation** (rep0): expected "expected-marker-delta-042", got "i don't have file-access tools available in this session, so i can't read `pf-delta/junk.txt` to report its contents. if you paste the file's content or provide the tool access needed to read it, i can then answer exactly as requested."
- **brain-parietal-behavior / file-l4-junk-body-validation** (rep0): expected "expected-marker-delta-042", got "channel=feishu_card | [read the file at pf-delta/junk.txt and answer with its content exactly. do not modify the file.]"
- **brain-prefrontal-llm / file-l4-junk-body-validation** (rep0): expected "expected-marker-delta-042", got "i wasn't able to read that file, and i want to be upfront about that rather than guess at its contents. **what i tried:** 1. **`http` with `file://pf-delta/junk.txt`** → failed. the tool only supports http/https urls, not local filesystem paths. 2. **`http` with `http://localhost/pf-delta/junk.txt`** → failed. no web server is running locally to serve the file. 3. **`mobile_action` (read_screen)** → 404, and it's the wrong tool anyway — it inspects a phone screen, not a filesystem. **why i'm not just answering:** i have no filesystem-read tool available in this session, and there's no working http endpoint for that path. i could not retrieve the content, so any \"exact content\" i produced would be fabricated. i won't invent file contents, especially when you've asked for an exact reproduction. **how to get this done — a few options:** - **serve the file over http**, then i can fetch it: ``` cd pf-delta && python3 -m http.server 8000 ``` then tell me and i'll get `http://localhost:8000/junk.txt`. - **paste the content** directly into the chat and i'll echo it back exactly (unmodified). - **if you have a shell/agent tool available**, point me at it — i have an acp coding-agent dispatch tool that could run `cat pf-delta/junk.txt` in a repo context, but i'd need to know the working directory and that the file is reachable from that agent's environment. say the word and i'll dispatch it. note: i did not modify the file — i only attempted read operations, all of which failed."
