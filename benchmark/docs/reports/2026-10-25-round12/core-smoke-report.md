# Benchmark report — core-smoke

generated: unix-1792936863 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| brain-prefrontal-llm | 8 | 2 | 0 | 80% | 80% | 0.89 |
| deepseek-chat | 9 | 1 | 0 | 90% | 90% | 1.04 |
| mimo-flash | 8 | 2 | 0 | 80% | 80% | 1.83 |

## Task matrix

| task | deepseek-chat | mimo-flash | brain-prefrontal-llm |
|---|---|---|---|
| arithmetic | ✓ | ✓ | ✓ |
| code-fix-python | ✓ | ✓ | ✗ |
| code-fix-rust-sha | ✗ | ✗ | ✗ |
| code-implement-python | ✓ | ✗ | ✓ |
| extraction | ✓ | ✓ | ✓ |
| format-following | ✓ | ✓ | ✓ |
| json-output | ✓ | ✓ | ✓ |
| letter-count | ✓ | ✓ | ✓ |
| rate-problem | ✓ | ✓ | ✓ |
| sql | ✓ | ✓ | ✓ |

## Failure details

- **deepseek-chat / code-fix-rust-sha** (rep0): expected "update", got "```path:answer.md digest::digest ```"
- **mimo-flash / code-implement-python** (rep0): exit Some(1)
Traceback (most recent call last):
  File "C:\Users\87462\AppData\Local\Temp\cerebellum-bench\code-implement-python\mimo-flash\rep0\prices_test.py", line 2, in <module>
    assert median([3.0, 1.0, 2.0]) == 2.0, 'odd length'
           ~~~~~~^^^^^^^^^^^^^^^^^
  File "C:\Users\87462\AppData\Local\Temp\cerebellum-bench\code-implement-python\mimo-flash\rep0\prices.py", line 3, in median
    raise NotImplementedError
NotImplementedError
- **mimo-flash / code-fix-rust-sha** (rep0): expected "update", got "```path:answer.md digest ```"
- **brain-prefrontal-llm / code-fix-python** (rep0): exit Some(1)
Traceback (most recent call last):
  File "C:\Users\87462\AppData\Local\Temp\cerebellum-bench\code-fix-python\brain-prefrontal-llm\rep0\task_test.py", line 2, in <module>
    assert add(2, 2) == 4, 'add(2,2) != 4'
           ^^^^^^^^^^^^^^
AssertionError: add(2,2) != 4
- **brain-prefrontal-llm / code-fix-rust-sha** (rep0): expected "update", got "i have a definitive answer now. **findings:** the premise of the question is mistaken. there is **no** free function named `sha256` (or any one-shot slice-hashing function) in the `sha2` crate. i verified this against the actual source of every relevant release: - **0.10.8** — `src/lib.rs` exposes only the `sha256` type alias plus `sha256varcore`, `compress256`, `oidsha256`. no `sha256()` function. - **0.11.0 / 0.11.1** (current latest is 0.11.1) — `src/lib.rs` defines `sha256` via the `digest::buffer_fixed!` macro. still no `sha256()` function. - the docs.rs 404s for `/sha2/latest/sha2/fn.sha256.html` and `/sha2/0.10.8/sha2/fn.sha256.html` corroborate this. the idiomatic way to hash a slice is the **`digest` trait's associated function `digest`**, called as `sha256::digest(b\"...\")` — exactly as the crate's own readme shows under \"one-shot api\". so the identifier that actually answers \"the function used to hash a slice with sha-256\" is `digest`. writing that, since it's the correct identifier rather than a fabricated `sha256`: ```path:answer.md digest ``` a note on why i didn't write `sha256`: the task says the file \"must contain exactly one line with the name of the rust function used to hash a slice with sha-256 in the sha2 crate.\" if i wrote `sha256`, the file would contain a non-existent function name — the file would satisfy the format but fail the actual intent. `digest` is the real function; it's an associated function on the `digest` trait, so it's reached as `sha256::digest(slice)`. if you specifically need a bare-identifier answer that a grader expects to be `sha256`, tell me and i'll write that instead — but it would be factually wrong for every published version of the crate."
