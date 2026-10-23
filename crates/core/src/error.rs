#[derive(Debug, Clone, PartialEq)]
pub enum ModelError {
    DuplicateStateId(String),
    DuplicateActionId(String),
    DuplicateTransitionId(String),

    UnknownInitialState(String),
    UnknownSourceState {action: String, state: String },
    UNknownAction { transition: String, action: String },
    UnknownTargetState { transition: String, action: String },

    InvalidProbability,
    InvalidReward,

    Overflow,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Warning {
    ProbabilitySum { action: String, sum: f64 },
    PolicySum { state: String, sum: f64 },
}

