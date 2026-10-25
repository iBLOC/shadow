# Benchmark report — terminal-bench-2-smoke

generated: unix-1792936912 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| deepseek-chat-agentic | 1 | 3 | 0 | 25% | 25% | 4.03 |

## Task matrix

| task | deepseek-chat-agentic |
|---|---|
| terminal-bench/llm-inference-batching-scheduler | ✗ |
| terminal-bench/raman-fitting | ✗ |
| terminal-bench/regex-log | ✓ |
| terminal-bench/schemelike-metacircular-eval | ✗ |

## Failure details

- **deepseek-chat-agentic / terminal-bench/llm-inference-batching-scheduler** (rep0): exit Some(1)
…
            # Check no duplicates
            assert len(ids_plan) == len(set(ids_plan)), (
                f"Duplicates found in bucket {bucket_idx}"
            )
    
>       _check_bucket_no_duplicates(1)

tests\test_outputs.py:289: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _

bucket_idx = 1

    def _check_bucket_no_duplicates(bucket_idx: int) -> None:
        """Check that a bucket has no duplicates and covers all requests."""
        reqs = _load_requests(bucket_idx)
        plan = _load_plan(f"plan_b{bucket_idx}.jsonl")
        ids_req = {r["request_id"] for r in reqs}
        ids_plan = [p["request_id"] for p in plan]
    
        # Check coverage
>       assert set(ids_plan) == ids_req, f"Coverage mismatch in bucket {bucket_idx}"
E       AssertionError: Coverage mismatch in bucket 1
E       assert set() == {'r-000000', ...-000005', ...}
E         Extra items in the right set:
E         'r-000083'
E         'r-000667'
E         'r-000724'
E         'r-000341'
E         'r-000299'
E         'r-000585'...
E         
E         ...Full output truncated (796 lines hidden), use '-vv' to show

tests\test_outputs.py:283: AssertionError
=========================== short test summary info ===========================
FAILED tests/test_outputs.py::test_generate_and_schema - AssertionError: requ...
FAILED tests/test_outputs.py::test_solution_coverage_no_duplicates - Assertio...
2 failed, 4 passed in 0.12s
- **deepseek-chat-agentic / terminal-bench/raman-fitting** (rep0): exit Some(1)
…_

    def test_result_file_exists():
        result_path = Path("results.json")
    
>       assert result_path.exists(), f"File {result_path} does not exist"
E       AssertionError: File results.json does not exist
E       assert False
E        +  where False = <bound method PathBase.exists of WindowsPath('results.json')>()
E        +    where <bound method PathBase.exists of WindowsPath('results.json')> = WindowsPath('results.json').exists

tests\test_outputs.py:11: AssertionError
_________________________________ test_G_Peak _________________________________

    def test_G_Peak():
        result_path = Path("results.json")
    
>       with open(result_path, "r") as f:
E       FileNotFoundError: [Errno 2] No such file or directory: 'results.json'

tests\test_outputs.py:17: FileNotFoundError
________________________________ test_2D_Peak _________________________________

    def test_2D_Peak():
        result_path = Path("results.json")
    
>       with open(result_path, "r") as f:
E       FileNotFoundError: [Errno 2] No such file or directory: 'results.json'

tests\test_outputs.py:46: FileNotFoundError
=========================== short test summary info ===========================
FAILED tests/test_outputs.py::test_result_file_exists - AssertionError: File ...
FAILED tests/test_outputs.py::test_G_Peak - FileNotFoundError: [Errno 2] No s...
FAILED tests/test_outputs.py::test_2D_Peak - FileNotFoundError: [Errno 2] No ...
3 failed in 0.08s
- **deepseek-chat-agentic / terminal-bench/schemelike-metacircular-eval** (rep0): exit Some(1)
…07313156127929688
FAILED: OUTPUT MISMATCH:
Direct:
Stack operations: Top: 3, After pop: 2
Queue operations: Front: 1, After dequeue: 2
Dictionary operations: Get 'b': 2, Get 'x': False
Tree map (double all values): Root: 2, First child: 4

Through eval.scm:
Error: Unexpected closing parenthesis

Testing: tests\test\test_read.scm
----------------------------------------
takes 0.06848669052124023
FAILED: OUTPUT MISMATCH:
Direct:
Reading
hello
Done

Through eval.scm:
Error: Unexpected closing parenthesis

Testing: tests\test\variadic_functions.scm
----------------------------------------
takes 0.0713036060333252
FAILED: OUTPUT MISMATCH:
Direct:
Sum of (1 2 3 4 5): 15
Product of (2 3 4): 24
Max of (3 1 4 1 5 9 2 6): 9
Min of (3 1 4 1 5 9 2 6): 1
Concatenate ((1 2) (3 4) (5 6)): (1 2 3 4 5 6)
Square all (1 2 3 4): (1 4 9 16)
((x + 1) * 2)^2 of 3: 64

Through eval.scm:
Error: Unexpected closing parenthesis

Testing: tests\test\y_combinator.scm
----------------------------------------
takes 0.07048177719116211
FAILED: OUTPUT MISMATCH:
Direct:
Factorial of 5 using Y combinator: 120
First 8 Fibonacci numbers: 0 1 1 2 3 5 8 13

Through eval.scm:
Error: Unexpected closing parenthesis

==================================================
Summary: 0 passed, 63 failed out of 63 tests
=========================== short test summary info ===========================
FAILED tests/test_outputs.py::test_interp - assert 63 == 0
1 failed in 12.47s
