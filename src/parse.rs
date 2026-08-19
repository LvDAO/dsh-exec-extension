//! Hosted argv parser used by WASM tests. The live CLI is commander in `js/command.js`.

use crate::effort::Effort;
use crate::overlay::SelectionOverrides;
use serde::{Deserialize, Serialize};

/// Successful parse of one invocation's inner argv (after launcher flags).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Invocation {
    pub task: String,
    #[serde(flatten)]
    pub overrides: SelectionOverrides,
}

/// Result of parsing the immutable `ctx.cmdlineArgs` snapshot.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ParseOutcome {
    Help { text: String },
    Error { message: String, exit_code: u8 },
    Ok { invocation: Invocation },
}

const PROGRAM: &str = "dsh --profile <profile>";

/// Commander-style help. `--help` must list `--model`, `--effort`, and `--provider`.
pub fn help_text() -> String {
    format!(
        "\
Usage: {PROGRAM} [options] [--] [task...]

Answer one task, print the final assistant message, and exit.

Arguments:
  task                      the task text; multiple words are joined by spaces

Options:
  -h, --help                show this help
  --model <id>              this-process default model
  --effort <off|high|max>   this-process reasoningEffort
  --provider <id>           this-process provider

Examples:
  {PROGRAM} --model deepseek-v4-pro --effort max \"run the tests\"
  {PROGRAM} \"run the tests\"
"
    )
}

/// Parse launcher-stripped app arguments.
pub fn parse_argv<I, S>(args: I) -> ParseOutcome
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let tokens: Vec<String> = args.into_iter().map(|s| s.as_ref().to_string()).collect();
    match parse_tokens(&tokens) {
        Ok(ParseTokens::Help) => ParseOutcome::Help { text: help_text() },
        Ok(ParseTokens::Invocation(invocation)) => ParseOutcome::Ok { invocation },
        Err(message) => ParseOutcome::Error {
            message,
            exit_code: 1,
        },
    }
}

enum ParseTokens {
    Help,
    Invocation(Invocation),
}

fn parse_tokens(tokens: &[String]) -> Result<ParseTokens, String> {
    let mut model: Option<String> = None;
    let mut provider: Option<String> = None;
    let mut effort: Option<Effort> = None;
    let mut task_parts: Vec<String> = Vec::new();
    let mut i = 0;

    while i < tokens.len() {
        let token = &tokens[i];
        if token == "--" {
            task_parts.extend(tokens[i + 1..].iter().cloned());
            break;
        }
        if token == "-h" || token == "--help" {
            return Ok(ParseTokens::Help);
        }
        if let Some(value) = option_value(token, "--model") {
            model = Some(require_option_value("--model <id>", value, tokens, &mut i)?);
            i += 1;
            continue;
        }
        if let Some(value) = option_value(token, "--provider") {
            provider = Some(require_option_value(
                "--provider <id>",
                value,
                tokens,
                &mut i,
            )?);
            i += 1;
            continue;
        }
        if let Some(value) = option_value(token, "--effort") {
            let raw = require_option_value("--effort <off|high|max>", value, tokens, &mut i)?;
            effort = Some(Effort::parse(&raw).ok_or_else(|| {
                format!("error: --effort must be one of off, high, max, got {raw:?}")
            })?);
            i += 1;
            continue;
        }
        if token.starts_with('-') && token != "-" {
            return Err(format!("error: unknown option '{token}'"));
        }
        task_parts.push(token.clone());
        i += 1;
    }

    let task = task_parts.join(" ");
    if task.trim().is_empty() {
        return Err(format!(
            "error: a task is required, for example: {PROGRAM} \"run the tests\""
        ));
    }

    Ok(ParseTokens::Invocation(Invocation {
        task,
        overrides: SelectionOverrides {
            model,
            provider,
            effort,
        },
    }))
}

/// `Some(Some(v))` for `--flag=v`; `Some(None)` for `--flag` taking the next token.
fn option_value<'a>(token: &'a str, flag: &str) -> Option<Option<&'a str>> {
    if token == flag {
        return Some(None);
    }
    let prefix = format!("{flag}=");
    token.strip_prefix(&prefix).map(Some)
}

fn require_option_value(
    spec: &str,
    inline: Option<&str>,
    tokens: &[String],
    i: &mut usize,
) -> Result<String, String> {
    if let Some(value) = inline {
        if value.is_empty() {
            return Err(format!("error: option '{spec}' argument missing"));
        }
        return Ok(value.to_string());
    }
    let next = tokens.get(*i + 1);
    match next {
        None => Err(format!("error: option '{spec}' argument missing")),
        Some(value) if value.starts_with('-') && value != "-" => {
            Err(format!("error: option '{spec}' argument missing"))
        }
        Some(value) => {
            *i += 1;
            Ok(value.clone())
        }
    }
}
