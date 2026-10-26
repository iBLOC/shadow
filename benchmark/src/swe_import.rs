//! SWE-bench Verified import — freeze dataset rows into a shadow suite
//! with a baked per-(repo, version) environment spec.
//!
//! Rows come from the HF datasets-server `rows` endpoint for
//! `princeton-nlp/SWE-bench_Verified` (envelope `{"rows":[{"row":…}]}`,
//! a plain array, or `{"data":[…]}` also accepted). The env spec table
//! is a transcription of swebench 3.0.9
//! `MAP_REPO_VERSION_TO_SPECS_PY` + `MAP_REPO_TO_REQS_PATHS`, plus
//! shadow's documented deviations (pinned runner pytest). Instances
//! whose (repo, version) is not in the table are refused at import —
//! running them with a guessed env would be worse than not running them.

use crate::swe::{SweEnvSpec, SweInstance, SweSuite};
use serde_json::Value;

#[derive(Debug, thiserror::Error)]
pub enum SweImportError {
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid SWE-bench data: {0}")]
    Invalid(String),
}

pub struct SweImportOpts<'a> {
    pub name: &'a str,
    pub source: &'a str,
    /// Select these instance ids (in this order). None = all rows.
    pub ids: Option<&'a [String]>,
}

/// Parse any of the known row containers into plain row objects.
pub fn parse_rows(json: &str) -> Result<Vec<Value>, SweImportError> {
    let v: Value = serde_json::from_str(json)?;
    if let Some(rows) = v.get("rows").and_then(|r| r.as_array()) {
        // datasets-server envelope: {"rows":[{"row":{…},"truncated":…}]}
        return Ok(rows.iter().filter_map(|r| r.get("row").cloned()).collect());
    }
    if let Some(data) = v.get("data").and_then(|r| r.as_array()) {
        return Ok(data.clone());
    }
    if let Some(arr) = v.as_array() {
        return Ok(arr.clone());
    }
    Err(SweImportError::Invalid(
        "expected a rows envelope, a data envelope or a plain array".into(),
    ))
}

/// Official NON_TEST_EXTS (constants.py, verbatim incl. the dotless "csv").
const NON_TEST_EXTS: [&str; 11] = [
    ".json", ".png", "csv", ".txt", ".md", ".jpg", ".jpeg", ".pkl", ".yml", ".yaml", ".toml",
];

/// Files touched by test_patch — official `get_test_directives`
/// (`diff --git a/.* b/(.*)` minus NON_TEST_EXTS).
fn test_files_of(test_patch: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in test_patch.lines() {
        if let Some(rest) = line.strip_prefix("diff --git a/") {
            // greedy regex semantics: split at the LAST " b/"
            if let Some(idx) = rest.rfind(" b/") {
                let path = &rest[idx + 3..];
                if NON_TEST_EXTS.iter().any(|ext| path.ends_with(ext)) {
                    continue;
                }
                if !path.is_empty() && !out.iter().any(|p| p == path) {
                    out.push(path.to_string());
                }
            }
        }
    }
    out
}

/// Parse FAIL_TO_PASS / PASS_TO_PASS: dataset rows carry them as
/// JSON-encoded list strings.
fn parse_test_list(v: &Value, what: &str, id: &str) -> Result<Vec<String>, SweImportError> {
    match v {
        Value::String(s) => serde_json::from_str::<Vec<String>>(s).map_err(|e| {
            SweImportError::Invalid(format!("{id}: {what} string not a list: {e}"))
        }),
        Value::Array(a) => a
            .iter()
            .map(|x| {
                x.as_str()
                    .map(String::from)
                    .ok_or_else(|| SweImportError::Invalid(format!("{id}: {what} has non-string")))
            })
            .collect(),
        _ => Err(SweImportError::Invalid(format!(
            "{id}: {what} missing or not a list"
        ))),
    }
}

/// The baked env spec table — swebench 3.0.9
/// `MAP_REPO_VERSION_TO_SPECS_PY` (+ `MAP_REPO_TO_REQS_PATHS`) for the
/// five (repo, version) lines of the smoke slice, with shadow's one
/// deviation: `pytest==7.4.4` pins where the official conda image
/// floats the runner (documented in the suite description).
pub fn env_spec(repo: &str, version: &str) -> Option<SweEnvSpec> {
    let (python, req_files, pip_packages, editable, dist_name) = match (repo, version) {
        // SPECS_FLASK["2.3"]: python 3.11, reqs via requirements/dev.txt,
        // pip pin block, editable install.
        ("pallets/flask", "2.3") => (
            "3.11",
            vec!["requirements/dev.txt"],
            vec![
                "setuptools==70.0.0",
                "click==8.1.3",
                "itsdangerous==2.1.2",
                "Jinja2==3.1.2",
                "MarkupSafe==2.1.1",
                "Werkzeug==2.3.7",
                "pytest==7.4.4",
            ],
            true,
            "flask",
        ),
        // SPECS_REQUESTS["2.27"]: python 3.9, packages "pytest" (conda,
        // floating -> pinned), NON-editable `pip install .` (the eval's
        // install re-run is what picks up the patch).
        ("psf/requests", "2.27") => ("3.9", vec![], vec!["pytest==7.4.4"], false, "requests"),
        // SPECS_PYLINT["2.14"]: python 3.9, reqs via requirements_test.txt.
        ("pylint-dev/pylint", "2.14") => (
            "3.9",
            vec!["requirements_test.txt"],
            vec!["pytest==7.4.4"],
            true,
            "pylint",
        ),
        // SPECS_PYLINT["3.0"]: adds astroid pin + setuptools.
        ("pylint-dev/pylint", "3.0") => (
            "3.9",
            vec!["requirements_test.txt"],
            vec!["astroid==3.0.0a6", "setuptools", "pytest==7.4.4"],
            true,
            "pylint",
        ),
        // SPECS_PYTEST["7.2"]: python 3.9, pip pin block; the repo IS
        // the runner (editable install of pytest itself).
        ("pytest-dev/pytest", "7.2") => (
            "3.9",
            vec![],
            vec![
                "attrs==23.1.0",
                "iniconfig==2.0.0",
                "packaging==23.1",
                "py==1.11.0",
                "tomli==2.0.1",
            ],
            true,
            "pytest",
        ),
        _ => return None,
    };
    Some(SweEnvSpec {
        python: python.into(),
        req_files: req_files.into_iter().map(String::from).collect(),
        pip_packages: pip_packages.into_iter().map(String::from).collect(),
        editable,
        dist_name: dist_name.into(),
    })
}

/// Build a suite from dataset rows. Instances whose (repo, version) has
/// no baked env spec are refused. `ids` empty/None = take all rows.
pub fn import_rows(json: &str, opts: &SweImportOpts) -> Result<SweSuite, SweImportError> {
    let rows = parse_rows(json)?;
    let wanted: Option<Vec<String>> = opts.ids.map(|v| v.to_vec());
    let mut instances = Vec::new();

    for row in &rows {
        let str_field = |key: &str| -> Result<String, SweImportError> {
            row.get(key)
                .and_then(|v| v.as_str())
                .map(String::from)
                .ok_or_else(|| SweImportError::Invalid(format!("row missing string `{key}`")))
        };
        let id = str_field("instance_id")?;
        if let Some(want) = &wanted {
            if !want.iter().any(|w| w == &id) {
                continue;
            }
        }
        let repo = str_field("repo")?;
        let version = str_field("version")?;
        let base_commit = str_field("base_commit")?;
        let environment_setup_commit = row
            .get("environment_setup_commit")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(String::from)
            .unwrap_or_else(|| base_commit.clone());
        let patch = str_field("patch")?;
        let test_patch = str_field("test_patch")?;
        let problem_statement = str_field("problem_statement")?;
        let hints_text = row
            .get("hints_text")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();

        let fail_to_pass = parse_test_list(
            row.get("FAIL_TO_PASS").unwrap_or(&Value::Null),
            "FAIL_TO_PASS",
            &id,
        )?;
        let pass_to_pass = parse_test_list(
            row.get("PASS_TO_PASS").unwrap_or(&Value::Null),
            "PASS_TO_PASS",
            &id,
        )?;

        let env = env_spec(&repo, &version).ok_or_else(|| {
            SweImportError::Invalid(format!(
                "{id}: no baked env spec for {repo}@{version} — extend swe_import::env_spec \
                 from swebench 3.0.9 MAP_REPO_VERSION_TO_SPECS_PY before importing"
            ))
        })?;

        let test_files = test_files_of(&test_patch);
        if fail_to_pass.is_empty() {
            return Err(SweImportError::Invalid(format!(
                "{id}: empty FAIL_TO_PASS — instance is not evaluable"
            )));
        }
        if test_files.is_empty() {
            return Err(SweImportError::Invalid(format!(
                "{id}: test_patch touches no test files"
            )));
        }

        instances.push(SweInstance {
            instance_id: id,
            repo,
            version,
            base_commit,
            environment_setup_commit,
            patch,
            test_patch,
            problem_statement,
            hints_text,
            fail_to_pass,
            pass_to_pass,
            test_files,
            env,
        });
    }

    if let Some(want) = &wanted {
        for w in want {
            if !instances.iter().any(|i| &i.instance_id == w) {
                return Err(SweImportError::Invalid(format!(
                    "instance id not found in rows: {w}"
                )));
            }
        }
    }
    if instances.is_empty() {
        return Err(SweImportError::Invalid("no instances imported".into()));
    }

    let description = format!(
        "SWE-bench Verified instances imported from {} ({} instances). \
         Local adaptation: the official Docker+conda harness is replaced by per-instance \
         uv venvs (tools/swe_driver.py) reproducing the swebench 3.0.9 evaluation semantics \
         exactly — patch-apply fallback chain, install re-run per eval, test-file anti-tamper \
         reset, `pytest -rA`, parse_log_pytest + grading.test_passed rules. Deviations: the \
         runner pytest is pinned to 7.4.4 where the official conda image floats it; requirement \
         files are pip-installed instead of conda-installed. Scores are NOT leaderboard-comparable \
         (official numbers use the Docker harness over all 500 instances with 12h task budgets).",
        opts.source,
        instances.len()
    );

    let suite = SweSuite {
        name: opts.name.to_string(),
        description,
        source: opts.source.to_string(),
        instances,
    };
    suite.validate().map_err(|e| {
        SweImportError::Invalid(e.to_string())
    })?;
    Ok(suite)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: &str, repo: &str, version: &str) -> Value {
        serde_json::json!({
            "instance_id": id,
            "repo": repo,
            "version": version,
            "base_commit": "b0",
            "environment_setup_commit": "e0",
            "patch": "diff --git a/src/x.py b/src/x.py\n--- a/src/x.py\n+++ b/src/x.py\n",
            "test_patch": "diff --git a/tests/test_x.py b/tests/test_x.py\n--- a/tests/test_x.py\n+++ b/tests/test_x.py\n",
            "problem_statement": "broken",
            "hints_text": "look at x",
            "FAIL_TO_PASS": "[\"tests/test_x.py::test_a\"]",
            "PASS_TO_PASS": "[\"tests/test_x.py::test_b\"]"
        })
    }

    #[test]
    fn parses_all_three_row_containers() {
        let arr = serde_json::json!([{"x": 1}]).to_string();
        assert_eq!(parse_rows(&arr).unwrap().len(), 1);

        let env = serde_json::json!({"rows": [{"row": {"x": 1}, "truncated": false}]}).to_string();
        assert_eq!(parse_rows(&env).unwrap().len(), 1);

        let data = serde_json::json!({"data": [{"x": 1}]}).to_string();
        assert_eq!(parse_rows(&data).unwrap().len(), 1);

        assert!(parse_rows("{\"nope\": 1}").is_err());
    }

    #[test]
    fn test_files_extraction_matches_official() {
        let tp = "diff --git a/tests/test_x.py b/tests/test_x.py\n\
                  diff --git a/README.md b/README.md\n\
                  diff --git a/data.json b/data.json\n\
                  diff --git a/tests/test_y.py b/tests/test_y.py\n";
        let files = test_files_of(tp);
        assert_eq!(files, vec!["tests/test_x.py", "tests/test_y.py"]);
    }

    #[test]
    fn import_bakes_env_spec_and_lists() {
        let rows = serde_json::json!([row("org__repo-1", "psf/requests", "2.27")]).to_string();
        let suite = import_rows(
            &rows,
            &SweImportOpts {
                name: "s",
                source: "test",
                ids: None,
            },
        )
        .unwrap();
        let i = &suite.instances[0];
        assert_eq!(i.test_files, vec!["tests/test_x.py"]);
        assert_eq!(i.fail_to_pass, vec!["tests/test_x.py::test_a"]);
        assert_eq!(i.pass_to_pass, vec!["tests/test_x.py::test_b"]);
        assert_eq!(i.env.python, "3.9");
        assert!(!i.env.editable, "requests uses non-editable install");
        assert_eq!(i.environment_setup_commit, "e0");
    }

    #[test]
    fn import_selects_ids_and_rejects_unknown() {
        let rows = serde_json::json!([
            row("org__repo-1", "psf/requests", "2.27"),
            row("org__repo-2", "pallets/flask", "2.3"),
        ])
        .to_string();
        let suite = import_rows(
            &rows,
            &SweImportOpts {
                name: "s",
                source: "t",
                ids: Some(&["org__repo-2".to_string()]),
            },
        )
        .unwrap();
        assert_eq!(suite.instances.len(), 1);
        assert_eq!(suite.instances[0].instance_id, "org__repo-2");
        assert_eq!(suite.instances[0].env.python, "3.11");

        let err = import_rows(
            &rows,
            &SweImportOpts {
                name: "s",
                source: "t",
                ids: Some(&["zz".to_string()]),
            },
        )
        .unwrap_err();
        assert!(err.to_string().contains("zz"));
    }

    #[test]
    fn import_refuses_unsupported_repo_version() {
        let rows = serde_json::json!([row("org__repo-9", "django/django", "3.2")]).to_string();
        let err = import_rows(
            &rows,
            &SweImportOpts {
                name: "s",
                source: "t",
                ids: None,
            },
        )
        .unwrap_err();
        assert!(err.to_string().contains("no baked env spec"));
    }
}
