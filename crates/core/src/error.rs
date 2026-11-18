use std::fmt;

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum ModelError {
    #[error("Invalid model: duplicate state id \"{0}\".")]
    DuplicateStateId(String),
    #[error("Invalid model: duplicate action id \"{0}\".")]
    DuplicateActionId(String),
    #[error("Invalid model: duplicate transition id \"{0}\".")]
    DuplicateTransitionId(String),

    #[error("There is no initial state.")]
    NoInitialState,
    #[error("The state \"{0}\" does not exist.")]
    UnknownInitialState(String),
    #[error("The transition {transition} with the target state {state} was not found.")]
    UnknownTargetState { transition: String, state: String },

    #[error("The probaility value {value} for the transition {transition} is not valid.")]
    InvalidProbability { transition: String, value: f64 },

    #[error("The state, action or transition has had an overflow for type u32.")]
    Overflow,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Warning {
    ProbabilitySum { action: String, sum: f64 },
    PolicySum { state: String, sum: f64 },
}

impl fmt::Display for Warning {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Warning::ProbabilitySum { action, sum } => {
                write!(
                    f,
                    "Action \"{action}\": transition probabilities sum to {sum}, not 1."
                )
            }
            Warning::PolicySum { state, sum } => {
                write!(f, "State \"{state}\": policy weights sum to {sum}, not 1.")
            }
        }
    }
}
