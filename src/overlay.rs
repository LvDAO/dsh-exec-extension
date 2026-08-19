//! In-process overlay of `currentSelection()`. Pure: no settings or credential IO.

use serde::{Deserialize, Serialize};

use crate::effort::Effort;

/// Detached default-model selection, matching dsh `ModelSelection` JSON shape.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelSelection {
    pub provider: String,
    pub model: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "reasoningEffort"
    )]
    pub reasoning_effort: Option<Effort>,
}

/// Flags present on this invocation. Absent fields must not be forced onto the selection.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SelectionOverrides {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<Effort>,
}

/// Overlay this-process flags onto a selection read from `currentSelection()`.
///
/// Omitted `--effort` leaves `reasoning_effort` untouched (including absent).
/// Present `--model` / `--provider` / `--effort` replace those fields as-is;
/// model ids are never special-cased.
pub fn overlay_selection(base: ModelSelection, overrides: &SelectionOverrides) -> ModelSelection {
    ModelSelection {
        provider: overrides.provider.clone().unwrap_or(base.provider),
        model: overrides.model.clone().unwrap_or(base.model),
        reasoning_effort: match overrides.effort {
            Some(effort) => Some(effort),
            None => base.reasoning_effort,
        },
    }
}
