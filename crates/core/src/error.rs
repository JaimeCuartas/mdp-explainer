#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum ModelError {
    #[error("The state id {0} already exist")]
    DuplicateStateId(String),
    #[error("The action id {0} already exist")]
    DuplicateActionId(String),
    #[error("The transition id {0} already exist")]
    DuplicateTransitionId(String),

    #[error("The state {0} does not exist")]
    UnknownInitialState(String),
    #[error("The action {action} with the source state {state} was not found")]
    UnknownSourceState { action: String, state: String },
    #[error("The action {action} to the transition {transition} was not found")]
    UNknownAction { transition: String, action: String },
    #[error("The transition {transition} with the target state {state} was not found")]
    UnknownTargetState { transition: String, state: String },

    #[error("The probaility value {value} for the transition {transition} is not valid")]
    InvalidProbability { transition: String, value: f64 },
    #[error("The reward value {value} for the transition {transition} is not valid")]
    InvalidReward { transition: String, value: f64 },

    #[error("The state, action or transition has had an overflow for type u32")]
    Overflow,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Warning {
    ProbabilitySum { action: String, sum: f64 },
    PolicySum { state: String, sum: f64 },
}
