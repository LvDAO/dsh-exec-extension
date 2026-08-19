//! Node-facing JSON wrappers. Hosted tests do not need this module's exports.

use wasm_bindgen::prelude::wasm_bindgen;

use crate::overlay::{overlay_selection, ModelSelection, SelectionOverrides};
use crate::parse::parse_argv;

#[wasm_bindgen(js_name = parseArgv)]
pub fn parse_argv_js(args: Vec<String>) -> String {
    serde_json::to_string(&parse_argv(args)).expect("parse outcome is always serializable")
}

#[wasm_bindgen(js_name = overlaySelection)]
pub fn overlay_selection_js(base_json: String, overrides_json: String) -> Result<String, String> {
    let base: ModelSelection = serde_json::from_str(&base_json)
        .map_err(|error| format!("overlaySelection: invalid base: {error}"))?;
    let overrides: SelectionOverrides = serde_json::from_str(&overrides_json)
        .map_err(|error| format!("overlaySelection: invalid overrides: {error}"))?;
    serde_json::to_string(&overlay_selection(base, &overrides))
        .map_err(|error| format!("overlaySelection: serialize: {error}"))
}

#[wasm_bindgen(js_name = helpText)]
pub fn help_text_js() -> String {
    crate::parse::help_text()
}
