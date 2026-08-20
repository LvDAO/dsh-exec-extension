//! In-process overlay of `agentDefaultModel.currentSelection()`.
//!
//! The live CLI is commander in `js/command.js`. This crate's `parse_argv`
//! is a hosted WASM helper used by unit tests; `js/startup.js` only calls
//! `overlaySelection`.

mod effort;
mod overlay;
mod parse;
mod wasm_api;

pub use effort::Effort;
pub use overlay::{overlay_selection, ModelSelection, SelectionOverrides};
pub use parse::{help_text, parse_argv, Invocation, ParseOutcome};

pub const HEADLESS_STARTUP_SERVICE: &str = "headlessStartup";
