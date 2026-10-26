#!/usr/bin/env python3
"""SWE-bench Verified per-instance evaluation driver (local-venv variant).

Implements the official swebench 3.0.9 evaluation semantics without
Docker/conda. One invocation evaluates one instance with one patch
(gold or model-produced) and writes a single result JSON.

Official sequence reproduced (test_spec/python.py `make_eval_script_list_py`
+ run_evaluation.py `GIT_APPLY_CMDS`):

  1. repo at base_commit, LF checkout (core.autocrlf=false, core.eol=lf);
  2. apply the patch under test with the official fallback chain
     `git apply --verbose` -> `git apply --verbose --reject`
     -> `patch --batch --fuzz=5 -p1 -i`;
  3. RE-RUN the spec install (this is why non-editable `pip install .`
     picks up the patched source);
  4. reset test files to base_commit state (anti-tamper against model
     edits to tests; files absent from base are deleted so test_patch
     can add them);
  5. apply test_patch;
  6. `pytest -rA <files touched by test_patch>`;
  7. parse the -rA short summary exactly like
     `log_parsers.python.parse_log_pytest` (lines starting with a
     TestStatus value; nodeid = second whitespace token) and grade like
     `grading.test_passed` (PASSED/XFAIL pass; missing/FAILED/ERROR fail).

Environment prep (step 0, cached via a marker file per instance):
uv venv with the spec's python, then flattened requirement files read
from environment_setup_commit, then spec pip_packages pins, then the
repo install. Deviation from the official conda images, documented in
the imported suite: the runner pytest is pinned instead of floating.

Every data-derived path (requirement include names, test-file paths,
task ids) is validated and confined to its base directory.

Usage:
  swe_driver.py --suite F --task-id ID (--patch-file F | --patches-file F | --gold | --worktree)
                --out F --work-root DIR [--test-timeout N] [--force-rebuild] [--prepare]

Modes:
  --gold         evaluate the frozen gold patch (oracle).
  --patch-file   evaluate a unified diff produced elsewhere.
  --patches-file evaluate JSON [{kind: whole-file|search-replace, ...}] edits.
  --worktree     the repo already contains the agent's edits (agentic
                 run happened in the checkout); skip reset/patch-apply.
  --prepare      set up repo + venv only (no evaluation); used before an
                 agentic run so the agent can work in the checkout.
"""

import argparse
import hashlib
import json
import os
import posixpath
import subprocess
import sys
import time
from pathlib import Path

# swebench.harness.constants.constants.TestStatus values
TEST_STATUSES = ("FAILED", "PASSED", "SKIPPED", "ERROR", "XFAIL")
# swebench.harness.constants.constants.NON_TEST_EXTS (verbatim, incl. "csv")
NON_TEST_EXTS = [
    ".json",
    ".png",
    "csv",
    ".txt",
    ".md",
    ".jpg",
    ".jpeg",
    ".pkl",
    ".yml",
    ".yaml",
    ".toml",
]
# run_evaluation.py GIT_APPLY_CMDS
APPLY_CHAIN = [
    ["git", "apply", "--verbose"],
    ["git", "apply", "--verbose", "--reject"],
    ["patch", "--batch", "--fuzz=5", "-p1", "-i"],
]
REQ_EXCLUDE_PREFIXES = ("-e .", "#", ".[test")


class DriverError(Exception):
    """Infrastructure failure (setup/install/driver-level)."""


def log(msg):
    print(f"[swe-driver] {msg}", flush=True)


def run(cmd, cwd, timeout=1800, env=None):
    """Run a subprocess, return (rc, combined_output). Never raises on rc."""
    try:
        p = subprocess.run(
            cmd,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        return p.returncode, p.stdout
    except FileNotFoundError as e:
        return 127, str(e)
    except subprocess.TimeoutExpired as e:
        out = e.stdout or ""
        if isinstance(out, bytes):
            out = out.decode("utf-8", "replace")
        return 124, out + f"\n[timed out after {timeout}s]"


def tail(s, n=600):
    s = s or ""
    return s if len(s) <= n else "…" + s[-n:]


def git(repo, *args, timeout=600):
    rc, out = run(["git", "-C", str(repo), *args], cwd=None, timeout=timeout)
    return rc, out


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, obj):
    Path(path).write_text(
        json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# path safety — every data-derived path is validated and confined
# ---------------------------------------------------------------------------

def safe_rel_path(base, rel, what):
    """Resolve `rel` under `base`; refuse absolute or escaping paths."""
    rel = (rel or "").replace("\\", "/")
    if not rel or rel.startswith("/") or rel.startswith("~"):
        raise DriverError(f"unsafe {what} path: {rel!r}")
    if ":" in rel.split("/")[0] or ".." in rel.split("/"):
        raise DriverError(f"unsafe {what} path (escapes base): {rel!r}")
    base_abs = os.path.abspath(str(base))
    resolved = os.path.abspath(os.path.join(base_abs, *rel.split("/")))
    if resolved != base_abs and not resolved.startswith(base_abs + os.sep):
        raise DriverError(f"unsafe {what} path (escapes base): {rel!r}")
    return resolved


def sanitize_id(s):
    """Task id -> single safe path segment."""
    out = "".join(c if c.isalnum() or c in "-_." else "_" for c in (s or ""))
    out = out.strip(".")
    if not out or out in (".", ".."):
        raise DriverError(f"unsafe task id: {s!r}")
    return out


# ---------------------------------------------------------------------------
# step 0: repository + environment
# ---------------------------------------------------------------------------

def ensure_repo(inst, repo_dir, reset=True):
    """Repo at base_commit with LF-only worktree. Both the base commit
    and environment_setup_commit must be fetchable (shallow).

    `reset=False` (worktree eval mode) keeps whatever the agent left in
    the checkout — resetting here would wipe the edits under test. It
    requires the repo to already exist (the --prepare step created it).
    """
    repo_dir = Path(repo_dir)
    url = "https://github.com/" + inst["repo"]
    if not (repo_dir / ".git").is_dir():
        repo_dir.mkdir(parents=True, exist_ok=True)
        for cmd in (
            ["git", "init"],
            ["git", "remote", "add", "origin", url],
            ["git", "config", "core.autocrlf", "false"],
            ["git", "config", "core.eol", "lf"],
            ["git", "config", "core.longpaths", "true"],
        ):
            rc, out = run(cmd, cwd=str(repo_dir))
            if rc != 0:
                raise DriverError(f"repo init failed ({' '.join(cmd)}): {tail(out)}")

    shas = [inst["base_commit"]]
    env_sha = inst.get("environment_setup_commit") or inst["base_commit"]
    if env_sha != inst["base_commit"]:
        shas.append(env_sha)
    for sha in shas:
        rc, _ = git(repo_dir, "cat-file", "-e", f"{sha}^{{commit}}")
        if rc != 0:
            log(f"fetching {sha} from {url}")
            rc, out = git(repo_dir, "fetch", "--depth", "1", "origin", sha, timeout=1800)
            if rc != 0:
                raise DriverError(f"git fetch {sha} failed: {tail(out)}")
            rc, _ = git(repo_dir, "cat-file", "-e", f"{sha}^{{commit}}")
            if rc != 0:
                raise DriverError(f"commit {sha} not present after fetch")

    if not reset:
        if not (repo_dir / ".git").is_dir():
            raise DriverError(
                "worktree eval needs a prepared repo (run --prepare first)"
            )
        return

    rc, out = git(repo_dir, "checkout", "-f", "--detach", inst["base_commit"])
    if rc != 0:
        raise DriverError(f"checkout base failed: {tail(out)}")
    rc, out = git(repo_dir, "reset", "--hard", inst["base_commit"])
    if rc != 0:
        raise DriverError(f"reset base failed: {tail(out)}")
    rc, out = git(repo_dir, "clean", "-fdx")
    if rc != 0:
        raise DriverError(f"clean failed: {tail(out)}")


def flatten_reqs(repo_dir, inst):
    """Official get_requirements_by_commit semantics: read req files at
    environment_setup_commit, expand `-r` includes relative to the
    include's directory, drop lines starting with `-e .`, `#`, `.[test`,
    includes' content first, parents' own lines last."""
    env_sha = inst.get("environment_setup_commit") or inst["base_commit"]

    def show(path):
        rc, out = git(repo_dir, "show", f"{env_sha}:{path}")
        if rc != 0:
            raise DriverError(f"git show {env_sha}:{path} failed: {tail(out)}")
        return out

    def excluded(line):
        return any(line.strip().startswith(p) for p in REQ_EXCLUDE_PREFIXES)

    flat_chunks = []

    def walk(path, depth):
        if depth > 5:
            raise DriverError(f"requirement include recursion too deep at {path}")
        text = show(path)
        req_dir = posixpath.dirname(path)
        own = []
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped.startswith("-r"):
                inc = stripped[len("-r"):].strip()
                # include names come from upstream file content: validate
                # and confine before joining so `-r ../x` cannot escape.
                safe_rel_path(
                    repo_dir,
                    posixpath.join(req_dir, inc) if req_dir else inc,
                    "req include",
                )
                inc_path = posixpath.normpath(posixpath.join(req_dir, inc)) if req_dir else inc
                walk(inc_path, depth + 1)
            elif not excluded(line):
                own.append(line)
        flat_chunks.extend(own)

    for path in inst["env"].get("req_files", []):
        safe_rel_path(repo_dir, path, "req file")
        walk(path, 0)

    return "\n".join(flat_chunks)


def venv_python(venv_dir):
    venv_dir = Path(venv_dir)
    win = venv_dir / "Scripts" / "python.exe"
    if win.exists():
        return win
    unix = venv_dir / "bin" / "python"
    if unix.exists():
        return unix
    raise DriverError(f"venv python not found under {venv_dir}")


def env_marker_key(inst, flat_reqs):
    spec = inst["env"]
    blob = json.dumps(
        {
            "base": inst["base_commit"],
            "env_sha": inst.get("environment_setup_commit") or "",
            "python": spec["python"],
            "req_files": spec.get("req_files", []),
            "pip_packages": spec.get("pip_packages", []),
            "editable": spec.get("editable", True),
            "flat": hashlib.sha256(flat_reqs.encode()).hexdigest(),
        },
        sort_keys=True,
    )
    return hashlib.sha256(blob.encode()).hexdigest()


def uv_bin():
    return os.environ.get("SHADOW_SWE_UV", "uv")


def ensure_env(inst, workdir, repo_dir, force):
    """venv + flattened reqs + pins + repo install. Cached by marker."""
    import shutil

    workdir = Path(workdir)
    repo_dir = Path(repo_dir)
    venv_dir = workdir / ".venv"
    marker = workdir / ".swe-env.json"

    flat_reqs = flatten_reqs(repo_dir, inst) if inst["env"].get("req_files") else ""
    key = env_marker_key(inst, flat_reqs)
    if not force and marker.exists():
        try:
            if read_json(marker).get("key") == key:
                log("env cache hit")
                return venv_python(venv_dir)
        except Exception:
            pass

    log("building environment")
    if venv_dir.exists():
        shutil.rmtree(venv_dir, ignore_errors=True)

    uv = uv_bin()
    rc, out = run(
        [uv, "venv", "--python", inst["env"]["python"], str(venv_dir)],
        cwd=str(workdir),
        timeout=1800,
    )
    if rc != 0:
        raise DriverError(f"uv venv failed: {tail(out)}")
    vpy = venv_python(venv_dir)

    if flat_reqs.strip():
        req_file = workdir / "requirements-flat.txt"
        req_file.write_text(flat_reqs + "\n", encoding="utf-8", newline="\n")
        rc, out = run(
            [uv, "pip", "install", "--python", str(vpy), "-r", str(req_file)],
            cwd=str(workdir),
            timeout=1800,
        )
        if rc != 0:
            raise DriverError(f"installing requirement files failed: {tail(out, 1200)}")

    pins = inst["env"].get("pip_packages", [])
    if pins:
        rc, out = run(
            [uv, "pip", "install", "--python", str(vpy), *pins],
            cwd=str(workdir),
            timeout=1800,
        )
        if rc != 0:
            raise DriverError(f"installing pip_packages failed: {tail(out, 1200)}")

    install_repo(inst, repo_dir, vpy)
    write_json(marker, {"key": key})
    return vpy


def dist_name(inst):
    return (inst["env"].get("dist_name") or inst["repo"].split("/")[-1]).lower()


def install_repo(inst, repo_dir, vpy):
    """Official specs['install'] — re-run at every evaluation so a
    non-editable install picks up the patched source.

    The pretend-version env replicates what the official images get from
    a git checkout WITH tags: setuptools-scm would otherwise fall back to
    0.1.dev1+g<sha> in our shallow tag-less fetch, and self-hosted suites
    (pytest's own) then die on `minversion` checks."""
    uv = uv_bin()
    editable = inst["env"].get("editable", True)
    dist = dist_name(inst)
    cmd = [uv, "pip", "install", "--python", str(vpy), "--reinstall-package", dist]
    if editable:
        cmd.append("-e")
    cmd.append(".")
    pretend = f'{inst["version"]}.0'
    env = dict(os.environ)
    env["SETUPTOOLS_SCM_PRETEND_VERSION"] = pretend
    env[f"SETUPTOOLS_SCM_PRETEND_VERSION_FOR_{dist.upper().replace('-', '_')}"] = pretend
    rc, out = run(cmd, cwd=str(repo_dir), timeout=1800, env=env)
    if rc != 0:
        raise DriverError(f"repo install failed: {tail(out, 1200)}")


# ---------------------------------------------------------------------------
# evaluation
# ---------------------------------------------------------------------------

def apply_patch_chain(repo_dir, patch_text, label):
    """Official GIT_APPLY_CMDS fallback chain. Returns strategy used."""
    patch_file = Path(repo_dir).parent / f"{label}.diff"
    # unified diffs must end with a newline; a missing one makes `patch`
    # reject the final hunk as "ends in middle of line"
    patch_file.write_text(patch_text.rstrip("\n") + "\n", encoding="utf-8", newline="\n")
    last = ""
    for cmd in APPLY_CHAIN:
        argv = [*cmd, str(patch_file)]
        rc, out = run(argv, cwd=str(repo_dir), timeout=600)
        last = f"{' '.join(cmd)} rc={rc}: {tail(out, 300)}"
        if rc == 0:
            return " ".join(cmd)
    raise DriverError(f"{label} patch failed to apply ({last})")


def apply_patches_and_diff(repo_dir, patches, label):
    """Apply patch entries to the repo, then `git add -A` and return the
    `git diff --cached` text (the unified patch the evaluator would
    have applied directly).

    Entry kinds:
      whole-file      {"path", "content"}            — overwrite the file
      search-replace  {"path", "search", "replace"}  — replace the FIRST
                        exact occurrence of `search`; empty `search`
                        prepends. Refuses silently-missing search text.

    Path safety mirrors `safe_rel_path` — refuses absolute paths and
    `..` components so a malicious answer cannot escape the repo.
    """
    for entry in patches:
        if not isinstance(entry, dict):
            raise DriverError(f"{label} patch entry not an object: {entry!r}")
        rel = entry.get("path")
        if not isinstance(rel, str):
            raise DriverError(f"{label} patch entry missing path: {entry!r}")
        dest = Path(safe_rel_path(repo_dir, rel, "patch path"))
        kind = entry.get("kind", "whole-file")
        if kind == "search-replace":
            search = entry.get("search")
            replace = entry.get("replace")
            if not isinstance(search, str) or not isinstance(replace, str):
                raise DriverError(f"{label} search-replace missing search/replace: {entry!r}")
            if not dest.exists():
                raise DriverError(f"{label} search-replace target missing: {rel}")
            text = dest.read_text(encoding="utf-8")
            if search == "":
                # Empty SEARCH = prepend at top of file.
                dest.write_text(replace + "\n" + text, encoding="utf-8", newline="\n")
            elif search not in text:
                snippet = tail(search.replace("\n", "\\n"), 120)
                raise DriverError(f"{label} SEARCH text not found in {rel}: {snippet}")
            else:
                dest.write_text(
                    text.replace(search, replace, 1), encoding="utf-8", newline="\n"
                )
        else:
            content = entry.get("content")
            if not isinstance(content, str):
                raise DriverError(f"{label} whole-file entry missing content: {entry!r}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content, encoding="utf-8", newline="\n")
    rc, out = git(repo_dir, "add", "-A", timeout=600)
    if rc != 0:
        raise DriverError(f"{label} git add failed: {tail(out)}")
    rc, out = git(repo_dir, "diff", "--cached", "--binary", timeout=600)
    if rc != 0:
        raise DriverError(f"{label} git diff failed: {tail(out)}")
    return out


def reset_test_files(inst, repo_dir):
    """Anti-tamper: test files go back to base_commit state. Files the
    test_patch adds (absent from base) are removed so it can add them."""
    for f in inst.get("test_files", []):
        p = safe_rel_path(repo_dir, f, "test file")
        rc, _ = git(repo_dir, "cat-file", "-e", f'{inst["base_commit"]}:{f}')
        if rc == 0:
            rc, out = git(repo_dir, "checkout", inst["base_commit"], "--", f)
            if rc != 0:
                raise DriverError(f"reset of test file {f} failed: {tail(out)}")
        elif os.path.exists(p):
            os.remove(p)


def parse_status_map(output):
    """Verbatim parse_log_pytest semantics (without the test_spec arg):
    lines starting with a TestStatus value, FAILED collapses ' - ',
    nodeid = second whitespace token."""
    sm = {}
    for line in output.split("\n"):
        if any(line.startswith(s) for s in TEST_STATUSES):
            if line.startswith("FAILED"):
                line = line.replace(" - ", " ")
            toks = line.split()
            if len(toks) <= 1:
                continue
            sm[toks[1]] = toks[0]
    return sm


def norm_case_id(case):
    """Canonicalise path-like parametrised ids. Official data records
    path params with their directory prefix collapsed to '/' (e.g. the
    `__file__` param of requests' TestExtractZippedPaths is recorded as
    [/test_utils.py] regardless of the absolute path the run saw). URL
    params contain '://' and are left untouched."""
    if "[" not in case or "://" in case:
        return case
    head, _, rest = case.partition("[")
    inner = rest[:-1] if rest.endswith("]") else rest
    parts = []
    for piece in inner.split(","):
        if ("/" in piece or "\\" in piece) and "://" not in piece:
            seg = piece.replace("\\", "/").rstrip("/").split("/")[-1]
            parts.append("/" + seg if seg else "/")
        else:
            parts.append(piece)
    return head + "[" + ",".join(parts) + "]"


def case_status(case, sm):
    """Exact hit first, then canonical-id hit, then reverse match of a
    collected id whose canonical form equals the expected one."""
    if case in sm:
        return sm[case]
    n = norm_case_id(case)
    if n in sm:
        return sm[n]
    for k, v in sm.items():
        if norm_case_id(k) in (case, n):
            return v
    return None


def passed_case(case, sm):
    """grading.test_passed: in map AND PASSED/XFAIL, with canonical-id
    matching for path-parametrised ids (see norm_case_id)."""
    return case_status(case, sm) in ("PASSED", "XFAIL")


def fallback_lookup(case, sm, output):
    """Safety net when the -rA summary tokenisation misses a parametrised
    id: find '<id> STATUS' anywhere in the output."""
    if case_status(case, sm) is not None:
        return
    for status in TEST_STATUSES:
        if f"{case} {status}" in output:
            sm[case] = status
            return


def evaluate(inst, patch_text, patches, workdir, test_timeout, force, worktree=False):
    workdir = Path(workdir)
    repo_dir = workdir / "repo"
    started = time.monotonic()

    # worktree mode: the agent's edits ARE the state — neither
    # ensure_repo's reset nor the block below may wipe them.
    ensure_repo(inst, repo_dir, reset=not worktree)
    vpy = ensure_env(inst, workdir, repo_dir, force)

    if not worktree:
        rc, out = git(repo_dir, "reset", "--hard", inst["base_commit"])
        if rc != 0:
            raise DriverError(f"reset failed: {tail(out)}")
        rc, out = git(repo_dir, "clean", "-fdx")
        if rc != 0:
            raise DriverError(f"clean failed: {tail(out)}")

        # Whole-file patches write source files directly; the model diff
        # path is skipped (the files are already there, no `git apply`).
        if patches is not None:
            _ = apply_patches_and_diff(repo_dir, patches, "model")
            log("patches applied via whole-file/search-replace write")
        else:
            strategy = apply_patch_chain(repo_dir, patch_text, "model")
            log(f"patch applied via {strategy}")
    else:
        log("worktree mode: keeping agent edits in place")
    install_repo(inst, repo_dir, vpy)
    reset_test_files(inst, repo_dir)
    apply_patch_chain(repo_dir, inst["test_patch"], "test")

    test_files = inst.get("test_files", [])
    if not test_files:
        raise DriverError("instance has no test_files")
    rc, out = run(
        [str(vpy), "-m", "pytest", "-rA", *test_files],
        cwd=str(repo_dir),
        timeout=test_timeout,
    )
    log(f"pytest rc={rc}")

    sm = parse_status_map(out)
    f2p = inst.get("fail_to_pass", [])
    p2p = inst.get("pass_to_pass", [])
    for t in list(f2p) + list(p2p):
        fallback_lookup(t, sm, out)

    f2p_fail = [t for t in f2p if not passed_case(t, sm)]
    p2p_fail = [t for t in p2p if not passed_case(t, sm)]
    resolved = not f2p_fail and not p2p_fail

    detail = (
        f"f2p {len(f2p) - len(f2p_fail)}/{len(f2p)}, "
        f"p2p {len(p2p) - len(p2p_fail)}/{len(p2p)}, pytest rc={rc}"
    )
    if f2p_fail:
        detail += f"; f2p failing/missing: {f2p_fail[:5]}"
    if p2p_fail:
        detail += f"; p2p failing/missing: {p2p_fail[:5]}"

    return {
        "task_id": inst["instance_id"],
        "passed": resolved,
        "detail": detail,
        "duration_secs": round(time.monotonic() - started, 3),
        "error": None,
        "f2p_pass": len(f2p) - len(f2p_fail),
        "f2p_total": len(f2p),
        "p2p_pass": len(p2p) - len(p2p_fail),
        "p2p_total": len(p2p),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--suite", required=True)
    ap.add_argument("--task-id", required=True)
    g = ap.add_mutually_exclusive_group(required=False)
    g.add_argument("--patch-file", help="unified diff to evaluate")
    g.add_argument(
        "--patches-file",
        help=(
            "JSON file: list of {kind: whole-file|search-replace, path, ...} "
            "edits. The harness writes each file / applies each "
            "search-replace, then evaluates (avoids model hand-writing "
            "diff hunks)."
        ),
    )
    g.add_argument("--gold", action="store_true", help="evaluate the gold patch")
    g.add_argument(
        "--worktree",
        action="store_true",
        help="evaluate the repo as-is (agent edited the checkout in place)",
    )
    ap.add_argument(
        "--prepare",
        action="store_true",
        help="set up repo + venv only, then exit (pre-agent step)",
    )
    ap.add_argument("--out", required=True)
    ap.add_argument("--work-root", required=True)
    ap.add_argument("--test-timeout", type=int, default=1200)
    ap.add_argument("--force-rebuild", action="store_true")
    args = ap.parse_args()
    if not (
        args.prepare
        or args.patch_file
        or args.patches_file
        or args.gold
        or args.worktree
    ):
        ap.error(
            "one of the arguments --patch-file --patches-file --gold --worktree "
            "--prepare is required"
        )

    started = time.monotonic()
    result = {
        "task_id": args.task_id,
        "passed": False,
        "detail": "",
        "duration_secs": 0.0,
        "error": None,
    }
    try:
        suite = read_json(args.suite)
        inst = next(
            (i for i in suite["instances"] if i["instance_id"] == args.task_id), None
        )
        if inst is None:
            raise DriverError(f"task {args.task_id} not in suite {args.suite}")

        # resolve to absolute: derived paths are passed to uv/git as argv
        # while the child cwd is also under work_root, and a relative argv
        # path would be resolved against the child cwd (double-nesting).
        workdir = Path(args.work_root).resolve() / sanitize_id(args.task_id)
        workdir.mkdir(parents=True, exist_ok=True)

        if args.prepare:
            repo_dir = workdir / "repo"
            ensure_repo(inst, repo_dir)
            ensure_env(inst, workdir, repo_dir, args.force_rebuild)
            log("prepare done")
            sys.exit(0)

        worktree = bool(args.worktree)
        patches = None
        patch_text = ""
        if args.gold:
            patch_text = inst["patch"]
        elif args.patches_file:
            loaded = read_json(args.patches_file)
            if not isinstance(loaded, list) or not loaded:
                raise DriverError("--patches-file must contain a non-empty JSON list")
            patches = loaded
        elif not worktree:
            patch_text = Path(args.patch_file).read_text(encoding="utf-8")
        if not worktree and not patches and not patch_text.strip():
            raise DriverError("empty patch")

        result = evaluate(
            inst, patch_text, patches, workdir, args.test_timeout,
            args.force_rebuild, worktree=worktree,
        )
    except DriverError as e:
        result["error"] = str(e)[:1500]
        result["duration_secs"] = round(time.monotonic() - started, 3)
    except Exception as e:  # noqa: BLE001 — driver must always report
        result["error"] = f"unexpected: {type(e).__name__}: {e}"[:1500]
        result["duration_secs"] = round(time.monotonic() - started, 3)

    write_json(args.out, result)
    log(json.dumps({k: result[k] for k in ("task_id", "passed", "error")}))
    sys.exit(0 if result["error"] is None else 2)


if __name__ == "__main__":
    main()
