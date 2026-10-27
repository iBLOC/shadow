# Benchmark report — terminal-bench-2-smoke

generated: unix-1791985389 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| deepseek-chat-agentic-50 | 1 | 3 | 0 | 25% | 25% | 7.72 |

## Task matrix

| task | deepseek-chat-agentic-50 |
|---|---|
| terminal-bench/llm-inference-batching-scheduler | ✗ |
| terminal-bench/raman-fitting | ✗ |
| terminal-bench/regex-log | ✓ |
| terminal-bench/schemelike-metacircular-eval | ✗ |

## Failure details

- **deepseek-chat-agentic-50 / terminal-bench/llm-inference-batching-scheduler** (rep0): exit Some(1)
…a batching plan.
    
        Args:
            req_path: Path to the input requests file (JSONL format)
            plan_path: Path to the output plan file (JSONL format)
            gran: Granularity for alignment calculations (default: 64)
    
        Returns:
            Dictionary containing performance metrics:
            - cost: Total computational cost
            - pad_ratio: Fraction of computation spent on padding
            - p95_latency_ms: 95th percentile latency in milliseconds
            - sequential_timecost: Total time to execute all batches sequentially
        """
        cm = CostModel(granularity=gran)
        with open(req_path) as f:
            reqs = [json.loads(line) for line in f]
        req_idx = {r["request_id"]: r for r in reqs}
>       with open(plan_path) as f:
E       FileNotFoundError: [Errno 2] No such file or directory: 'task_file/output_data/plan_b1.jsonl'

tests\test_outputs.py:54: FileNotFoundError
=========================== short test summary info ===========================
FAILED tests/test_outputs.py::test_output_files_exist - AssertionError: Missi...
FAILED tests/test_outputs.py::test_generate_and_schema - FileNotFoundError: [...
FAILED tests/test_outputs.py::test_solution_shape_feasibility_and_batch_consistency
FAILED tests/test_outputs.py::test_solution_coverage_no_duplicates - FileNotF...
FAILED tests/test_outputs.py::test_performance_thresholds - FileNotFoundError...
5 failed, 1 passed in 0.17s
- **deepseek-chat-agentic-50 / terminal-bench/raman-fitting** (rep0): exit Some(1)
…esult_path = Path("results.json")
    
        with open(result_path, "r") as f:
            data = json.load(f)
    
        x0_expected = 2670.08
        gamma_expected = 17.52
        A_expected = 12314.42
        offset_expected = 1239.09
    
        G_peak = data["2D"]
        x0 = G_peak["x0"]
        gamma = G_peak["gamma"]
        A = G_peak["amplitude"]
        offset = G_peak["offset"]
    
        x0_correct = abs(1 - x0 / x0_expected) < 0.05
        gamma_correct = abs(gamma - gamma_expected) < 1
        A_correct = abs(1 - A / A_expected) < 0.05
        offset_correct = abs(1 - offset / offset_expected) < 0.1
    
>       assert x0_correct and gamma_correct and A_correct and offset_correct, (
            f"Expected 2D_peak values: x0={x0_expected}, gamma={gamma_expected}, "
            f"A={A_expected}, offset={offset_expected}. "
            f"Got: x0={x0}, gamma={gamma}, A={A}, offset={offset}"
        )
E       AssertionError: Expected 2D_peak values: x0=2670.08, gamma=17.52, A=12314.42, offset=1239.09. Got: x0=6327.004772823943, gamma=34.85407895268729, A=8363.999412522238, offset=5658.94253777626
E       assert (False)

tests\test_outputs.py:65: AssertionError
=========================== short test summary info ===========================
FAILED tests/test_outputs.py::test_G_Peak - AssertionError: Expected G_peak v...
FAILED tests/test_outputs.py::test_2D_Peak - AssertionError: Expected 2D_peak...
2 failed, 1 passed in 0.09s
- **deepseek-chat-agentic-50 / terminal-bench/schemelike-metacircular-eval** (rep0): exit Some(1)
…alse
Tree map (double all values): Root: 2, First child: 4

Through eval.scm:
[RECURSION] Deep recursion detected! Last expression: ('fgetchr' 'f')
Unexpected error: Recursion limit exceeded

Testing: tests\test\test_read.scm
----------------------------------------
takes 0.08432865142822266
FAILED: OUTPUT MISMATCH:
Direct:
Reading
hello
Done

Through eval.scm:
Unexpected error: 'str' object has no attribute 'car'

Testing: tests\test\variadic_functions.scm
----------------------------------------
takes 0.09736204147338867
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
[RECURSION] Deep recursion detected! Last expression: ('fgetchr' 'f')
Unexpected error: Recursion limit exceeded

Testing: tests\test\y_combinator.scm
----------------------------------------
takes 0.09628558158874512
FAILED: OUTPUT MISMATCH:
Direct:
Factorial of 5 using Y combinator: 120
First 8 Fibonacci numbers: 0 1 1 2 3 5 8 13

Through eval.scm:
Unexpected error: 'str' object has no attribute 'car'

==================================================
Summary: 0 passed, 63 failed out of 63 tests
=========================== short test summary info ===========================
FAILED tests/test_outputs.py::test_interp - assert 63 == 0
1 failed in 14.19s
