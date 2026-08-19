//! Per-invocation model/effort/provider for DeepSeek Harness headless.
//!
//! The Cordis plugin in `js/startup.js` loads this crate as WebAssembly and
//! uses it to parse app argv and overlay `ctx.agentDefaultModel.currentSelection()`.

mod effort;
mod overlay;
mod parse;
mod wasm_api;

pub use effort::Effort;
pub use overlay::{overlay_selection, ModelSelection, SelectionOverrides};
pub use parse::{help_text, parse_argv, Invocation, ParseOutcome};

pub const HEADLESS_STARTUP_SERVICE: &str = "headlessStartup";
