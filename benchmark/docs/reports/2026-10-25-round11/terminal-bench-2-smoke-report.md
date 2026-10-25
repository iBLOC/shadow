# Benchmark report — terminal-bench-2-smoke

generated: unix-1792914333 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 0 | 4 | 0 | 0% | 0% | 30.01 |
| deepseek-chat | 0 | 4 | 0 | 0% | 0% | 2.36 |

## Task matrix

| task | deepseek-chat | brain-prefrontal-llm |
|---|---|---|
| terminal-bench/llm-inference-batching-scheduler | ✗ | ✗ |
| terminal-bench/raman-fitting | ✗ | ✗ |
| terminal-bench/regex-log | ✗ | ✗ |
| terminal-bench/schemelike-metacircular-eval | ✗ | ✗ |

## Failure details

- **deepseek-chat / terminal-bench/llm-inference-batching-scheduler** (rep0): exit Some(1)
…hadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:936
..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:936
..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:936
..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:936
..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:936
  C:\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:936: DeprecationWarning: ast.Str is deprecated and will be removed in Python 3.14; use ast.Constant instead
    assertmsg = ast.Str("")

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
=========================== short test summary info ===========================
FAILED tests/test_outputs.py::test_output_files_exist - AssertionError: Missi...
FAILED tests/test_outputs.py::test_generate_and_schema - FileNotFoundError: [...
FAILED tests/test_outputs.py::test_solution_shape_feasibility_and_batch_consistency
FAILED tests/test_outputs.py::test_solution_coverage_no_duplicates - FileNotF...
FAILED tests/test_outputs.py::test_performance_thresholds - FileNotFoundError...
5 failed, 1 passed, 265 warnings in 0.24s
- **deepseek-chat / terminal-bench/raman-fitting** (rep0): exit Some(1)
…write.py:938
  C:\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:938: DeprecationWarning: ast.Str is deprecated and will be removed in Python 3.14; use ast.Constant instead
    template = ast.BinOp(assertmsg, ast.Add(), ast.Str(explanation))

..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:950
..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:950
..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:950
..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:950
  C:\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:950: DeprecationWarning: ast.NameConstant is deprecated and will be removed in Python 3.14; use ast.Constant instead
    clear = ast.Assign(variables, ast.NameConstant(None))

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
=========================== short test summary info ===========================
FAILED tests/test_outputs.py::test_G_Peak - json.decoder.JSONDecodeError: Exp...
FAILED tests/test_outputs.py::test_2D_Peak - json.decoder.JSONDecodeError: Ex...
2 failed, 1 passed, 50 warnings in 0.11s
- **deepseek-chat / terminal-bench/regex-log** (rep0): exit Some(1)
…sertion\rewrite.py:950
..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:950
  C:\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:950: DeprecationWarning: ast.NameConstant is deprecated and will be removed in Python 3.14; use ast.Constant instead
    clear = ast.Assign(variables, ast.NameConstant(None))

..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:1075
  C:\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:1075: DeprecationWarning: ast.Str is deprecated and will be removed in Python 3.14; use ast.Constant instead
    syms.append(ast.Str(sym))

..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:1077
  C:\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:1077: DeprecationWarning: ast.Str is deprecated and will be removed in Python 3.14; use ast.Constant instead
    expls.append(ast.Str(expl))

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
=========================== short test summary info ===========================
FAILED tests/test_outputs.py::test_regex_matches_dates - AssertionError: Rege...
1 failed, 20 warnings in 0.17s
- **deepseek-chat / terminal-bench/schemelike-metacircular-eval** (rep0): exit Some(1)
…write.py:936
  C:\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:936: DeprecationWarning: ast.Str is deprecated and will be removed in Python 3.14; use ast.Constant instead
    assertmsg = ast.Str("")

..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:938
  C:\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:938: DeprecationWarning: ast.Str is deprecated and will be removed in Python 3.14; use ast.Constant instead
    template = ast.BinOp(assertmsg, ast.Add(), ast.Str(explanation))

..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:950
..\..\..\..\..\..\..\..\..\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:950
  C:\Projects\iBLOC\shadow\benchmark\.swe-work\pytest-dev__pytest-10051\repo\src\_pytest\assertion\rewrite.py:950: DeprecationWarning: ast.NameConstant is deprecated and will be removed in Python 3.14; use ast.Constant instead
    clear = ast.Assign(variables, ast.NameConstant(None))

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
=========================== short test summary info ===========================
FAILED tests/test_outputs.py::test_interp - assert 63 == 0
1 failed, 12 warnings in 23.78s
- **brain-prefrontal-llm / terminal-bench/llm-inference-batching-scheduler** (rep0): agent 'brain-prefrontal-llm' failed: brain a2a error 5021: A2A HTTP send: error sending request for url (http://127.0.0.1:18082/api/a2a)
- **brain-prefrontal-llm / terminal-bench/raman-fitting** (rep0): agent 'brain-prefrontal-llm' failed: brain a2a error 5021: A2A HTTP send: error sending request for url (http://127.0.0.1:18082/api/a2a)
- **brain-prefrontal-llm / terminal-bench/regex-log** (rep0): exit Some(4)
no tests ran in 0.00s
ERROR: file or directory not found: tests/test_outputs.py
- **brain-prefrontal-llm / terminal-bench/schemelike-metacircular-eval** (rep0): agent 'brain-prefrontal-llm' failed: brain a2a error 5021: A2A HTTP send: error sending request for url (http://127.0.0.1:18082/api/a2a)
