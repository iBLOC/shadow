# Benchmark report — core-smoke

generated: unix-1790658059 · repeat: 2 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| deepseek-harness | 0 | 0 | 10 | 0% | 0% | 0.00 |
| openclaw | 0 | 0 | 10 | 0% | 0% | 0.00 |
| pi | 0 | 0 | 10 | 0% | 0% | 0.00 |
| shadow-neuron | 4 | 6 | 0 | 40% | 40% | 2.40 |

## Task matrix

| task | shadow-neuron | openclaw | pi | deepseek-harness |
|---|---|---|---|---|
| arithmetic | ✗✗ | skip | skip | skip |
| code-fix-python | ✓✓ | skip | skip | skip |
| code-fix-rust-sha | ✗✗ | skip | skip | skip |
| code-implement-python | ✗✗ | skip | skip | skip |
| extraction | ✗✗ | skip | skip | skip |
| format-following | ✓✓ | skip | skip | skip |
| json-output | ✓✓ | skip | skip | skip |
| letter-count | ✗✗ | skip | skip | skip |
| rate-problem | ✗✗ | skip | skip | skip |
| sql | ✓✓ | skip | skip | skip |

## Failure details

- **shadow-neuron / arithmetic** (rep0): expected "391", got "17 * 23 = 391"
- **shadow-neuron / arithmetic** (rep1): expected "391", got "17 * 23 = 391"
- **shadow-neuron / rate-problem** (rep0): expected "90", got "60 km/h × 1.5 h = 90 km."
- **shadow-neuron / rate-problem** (rep1): expected "90", got "60 km/h × 1.5 h = 90 km."
- **shadow-neuron / letter-count** (rep0): expected "3", got "1"
- **shadow-neuron / letter-count** (rep1): expected "3", got "1"
- **shadow-neuron / extraction** (rep0): expected "1280", got "1280.00"
- **shadow-neuron / extraction** (rep1): expected "1280", got "1280.00"
- **shadow-neuron / code-implement-python** (rep0): exit Some(1)
Traceback (most recent call last):
  File "C:\Users\87462\AppData\Local\Temp\cerebellum-bench\code-implement-python\shadow-neuron\rep0\prices_test.py", line 2, in <module>
    assert median([3.0, 1.0, 2.0]) == 2.0, 'odd length'
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: odd length
- **shadow-neuron / code-implement-python** (rep1): exit Some(1)
Traceback (most recent call last):
  File "C:\Users\87462\AppData\Local\Temp\cerebellum-bench\code-implement-python\shadow-neuron\rep1\prices_test.py", line 2, in <module>
    assert median([3.0, 1.0, 2.0]) == 2.0, 'odd length'
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: odd length
- **shadow-neuron / code-fix-rust-sha** (rep0): expected "update", got "```path:answer.md sha2::sha256::sha256::hash_slice ```"
- **shadow-neuron / code-fix-rust-sha** (rep1): expected "update", got "```path:answer.md sha2::sha256::sha256::hash_slice ```"
