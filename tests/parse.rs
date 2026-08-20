//! Hosted WASM argv parser. This is not the live CLI (`js/command.js`).
//! Exec flags such as `--sandbox` are unknown here on purpose.

use dsh_exec_extension::{help_text, parse_argv, Effort, ParseOutcome};

fn ok(args: &[&str]) -> dsh_exec_extension::Invocation {
    match parse_argv(args.iter().copied()) {
        ParseOutcome::Ok { invocation } => invocation,
        other => panic!("expected Ok, got {other:?}"),
    }
}

fn error(args: &[&str]) -> String {
    match parse_argv(args.iter().copied()) {
        ParseOutcome::Error { message, exit_code } => {
            assert_eq!(exit_code, 1);
            message
        }
        other => panic!("expected Error, got {other:?}"),
    }
}

#[test]
fn joins_task_words_like_stock_headless() {
    let invocation = ok(&["run", "the", "tests"]);
    assert_eq!(invocation.task, "run the tests");
    assert_eq!(invocation.overrides.model, None);
    assert_eq!(invocation.overrides.effort, None);
    assert_eq!(invocation.overrides.provider, None);
}

#[test]
fn model_flag_is_never_part_of_task() {
    let invocation = ok(&["--model", "foo", "prove", "X"]);
    assert_eq!(invocation.overrides.model.as_deref(), Some("foo"));
    assert_eq!(invocation.task, "prove X");
}

#[test]
fn model_equals_form_is_never_part_of_task() {
    let invocation = ok(&["--model=foo", "prove", "X"]);
    assert_eq!(invocation.overrides.model.as_deref(), Some("foo"));
    assert_eq!(invocation.task, "prove X");
}

#[test]
fn double_dash_stops_flag_parsing() {
    let invocation = ok(&["--model", "foo", "--", "--effort", "max", "prove"]);
    assert_eq!(invocation.overrides.model.as_deref(), Some("foo"));
    assert_eq!(invocation.overrides.effort, None);
    assert_eq!(invocation.task, "--effort max prove");
}

#[test]
fn effort_accepts_only_deepseek_enum() {
    assert_eq!(
        ok(&["--effort", "off", "t"]).overrides.effort,
        Some(Effort::Off)
    );
    assert_eq!(
        ok(&["--effort", "high", "t"]).overrides.effort,
        Some(Effort::High)
    );
    assert_eq!(
        ok(&["--effort=max", "t"]).overrides.effort,
        Some(Effort::Max)
    );
}

#[test]
fn effort_rejects_codex_and_unknown_tiers() {
    for value in ["xhigh", "minimal", "low", "medium", "ultra"] {
        let message = error(&["--effort", value, "t"]);
        assert!(message.contains("off, high, max"), "{message}");
        assert!(message.contains(value), "{message}");
    }
}

#[test]
fn provider_flag_is_optional() {
    let invocation = ok(&["--provider", "deepseek-official", "do", "it"]);
    assert_eq!(
        invocation.overrides.provider.as_deref(),
        Some("deepseek-official")
    );
    assert_eq!(invocation.task, "do it");
}

#[test]
fn omitted_model_and_effort_leave_overrides_empty() {
    let invocation = ok(&["just", "the", "task"]);
    assert_eq!(invocation.overrides, Default::default());
}

#[test]
fn unknown_option_is_an_error() {
    let message = error(&["--model", "x", "--not-a-real-flag", "t"]);
    assert!(message.contains("unknown option"), "{message}");
    assert!(message.contains("--not-a-real-flag"), "{message}");
}

#[test]
fn hosted_parser_does_not_implement_live_exec_flags() {
    let message = error(&["--sandbox", "read-only", "t"]);
    assert!(message.contains("unknown option"), "{message}");
    assert!(message.contains("--sandbox"), "{message}");
}

#[test]
fn missing_model_value_is_an_error() {
    let message = error(&["--model"]);
    assert!(message.contains("--model"), "{message}");
    assert!(message.contains("argument missing"), "{message}");
}

#[test]
fn whitespace_only_task_is_rejected() {
    let message = error(&["  "]);
    assert!(message.contains("a task is required"), "{message}");
}

#[test]
fn empty_argv_is_rejected() {
    let message = error(&[]);
    assert!(message.contains("a task is required"), "{message}");
}

#[test]
fn help_lists_the_three_flags() {
    match parse_argv(["--help"]) {
        ParseOutcome::Help { text } => {
            assert!(text.contains("--model"));
            assert!(text.contains("--effort"));
            assert!(text.contains("--provider"));
            assert!(text.contains("off|high|max"));
        }
        other => panic!("expected Help, got {other:?}"),
    }
    assert!(help_text().contains("--model"));
}

#[test]
fn help_after_double_dash_is_task_text() {
    let invocation = ok(&["--", "--help"]);
    assert_eq!(invocation.task, "--help");
}

#[test]
fn last_repeated_flag_wins() {
    let invocation = ok(&["--model", "a", "--model", "b", "t"]);
    assert_eq!(invocation.overrides.model.as_deref(), Some("b"));
}

#[test]
fn model_ids_are_not_special_cased() {
    let invocation = ok(&["--model", "gpt-5.5", "t"]);
    assert_eq!(invocation.overrides.model.as_deref(), Some("gpt-5.5"));
    assert_eq!(invocation.task, "t");
}
