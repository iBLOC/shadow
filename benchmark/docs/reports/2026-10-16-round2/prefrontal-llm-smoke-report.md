# Benchmark report — prefrontal-llm-smoke

generated: unix-1792162739 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-parietal-behavior | 1 | 4 | 0 | 20% | 20% | 0.00 |
| brain-prefrontal-llm | 5 | 0 | 0 | 100% | 100% | 0.74 |
| deepseek-chat | 5 | 0 | 0 | 100% | 100% | 0.77 |

## Task matrix

| task | deepseek-chat | brain-parietal-behavior | brain-prefrontal-llm |
|---|---|---|---|
| llm-arithmetic | ✓ | ✗ | ✓ |
| llm-arithmetic-2 | ✓ | ✗ | ✓ |
| llm-capital | ✓ | ✗ | ✓ |
| llm-count | ✓ | ✗ | ✓ |
| llm-format-pong | ✓ | ✓ | ✓ |

## Failure details

- **brain-parietal-behavior / llm-arithmetic** (rep0): expected "56", got "channel=feishu_card | [what is 7*8? answer with just the number]"
- **brain-parietal-behavior / llm-arithmetic-2** (rep0): expected "12", got "channel=feishu_card | [what is 144/12? answer with just the number]"
- **brain-parietal-behavior / llm-capital** (rep0): expected "paris", got "channel=feishu_card | [what is the capital of france? answer with just the city name.]"
- **brain-parietal-behavior / llm-count** (rep0): expected "6", got "channel=feishu_card | [how many letters are in the word 'banana'? count only the letters, answer with just the number.]"
