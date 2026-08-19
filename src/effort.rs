//! DeepSeek reasoning-effort enum accepted on `--effort`.

use serde::{Deserialize, Serialize};

/// Selectable reasoning efforts for this process. Matches DeepSeek's enum only.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Effort {
    Off,
    High,
    Max,
}

impl Effort {
    /// Parse a flag value. Unknown spellings are rejected; extra tiers are not mapped here.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "off" => Some(Self::Off),
            "high" => Some(Self::High),
            "max" => Some(Self::Max),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::High => "high",
            Self::Max => "max",
        }
    }
}
