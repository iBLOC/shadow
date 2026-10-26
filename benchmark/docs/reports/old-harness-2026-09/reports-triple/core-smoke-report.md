# Benchmark report — core-smoke

generated: unix-1790748498 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| iBLOC-encephalon-server | 2 | 2 | 0 | 50% | 50% | 160.69 |
| shadow-desktop | 2 | 2 | 0 | 50% | 50% | 179.61 |
| shadow-neuron | 2 | 2 | 0 | 50% | 50% | 159.42 |

## Task matrix

| task | shadow-neuron | shadow-desktop | iBLOC-encephalon-server |
|---|---|---|---|
| arithmetic | ✗ | ✗ | ✗ |
| code-fix-python | ✗ | ✗ | ✗ |
| format-following | ✓ | ✓ | ✓ |
| json-output | ✓ | ✓ | ✓ |

## Failure details

- **shadow-neuron / arithmetic** (rep0): expected "391", got "17 * 23 = 391"
- **shadow-neuron / code-fix-python** (rep0): agent 'shadow-neuron' failed: task timed out after 240s
- **shadow-desktop / arithmetic** (rep0): expected "391", got "17 × 23 = 391"
- **shadow-desktop / code-fix-python** (rep0): agent 'shadow-desktop' failed: task timed out after 240s
- **iBLOC-encephalon-server / arithmetic** (rep0): expected "391", got "17 * 23 = 391"
- **iBLOC-encephalon-server / code-fix-python** (rep0): agent 'iBLOC-encephalon-server' failed: task timed out after 240s
