# Benchmark report — swe-verified-smoke

generated: unix-1791947753 · repeat: 3 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| deepseek-chat-agentic-50 | 4 | 1 | 0 | 80% | 80% | 5.77 |

## Task matrix

| task | deepseek-chat-agentic-50 |
|---|---|
| pallets__flask-5014 | ✓✓✓ |
| psf__requests-6028 | ✓✓✓ |
| pylint-dev__pylint-6386 | ✗✗✗ |
| pylint-dev__pylint-8898 | ✓✓✓ |
| pytest-dev__pytest-10051 | ✓✓✓ |

## Failure details

- **deepseek-chat-agentic-50 / pylint-dev__pylint-6386** (rep0): f2p 0/1, p2p 7/7, pytest rc=1; f2p failing/missing: ['tests/config/test_config.py::test_short_verbose']
- **deepseek-chat-agentic-50 / pylint-dev__pylint-6386** (rep1): f2p 0/1, p2p 7/7, pytest rc=1; f2p failing/missing: ['tests/config/test_config.py::test_short_verbose']
- **deepseek-chat-agentic-50 / pylint-dev__pylint-6386** (rep2): f2p 0/1, p2p 7/7, pytest rc=1; f2p failing/missing: ['tests/config/test_config.py::test_short_verbose']
