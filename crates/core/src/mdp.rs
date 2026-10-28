use std::collections::HashMap;
use std::ops::Range;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct StateIdx(u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ActionIdx(u32);

impl StateIdx {
    #[must_use]
    pub fn index(self) -> usize {
        self.0 as usize
    }
}

impl ActionIdx {
    #[must_use]
    pub fn index(self) -> usize {
        self.0 as usize
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Mdp {
    initial: Option<StateIdx>,
    action_start: Vec<u32>,
    outcome_start: Vec<u32>,
    targets: Vec<StateIdx>,
    probabilities: Vec<f64>,
    rewards: Vec<f64>,

    action_source: Vec<StateIdx>,
    state_ids: Vec<String>,
    state_labels: Vec<String>,
    action_ids: Vec<String>,
    action_labels: Vec<String>,
    transition_ids: Vec<String>,
    state_index: HashMap<String, StateIdx>,
    action_index: HashMap<String, ActionIdx>,
}

impl Mdp {
    // For algorithms
    #[must_use]
    pub fn initial_state(&self) -> Option<StateIdx> {
        self.initial
    }

    pub fn states(&self) -> impl Iterator<Item = StateIdx> + use<> {
        (0..).take(self.num_states()).map(StateIdx)
    }

    #[must_use]
    pub fn num_states(&self) -> usize {
        self.action_start.len() - 1
    }

    pub fn actions(&self, s: StateIdx) -> impl ExactSizeIterator<Item = ActionIdx> + use<> {
        (self.action_start[s.index()]..self.action_start[s.index() + 1]).map(ActionIdx)
    }

    fn outcome_range(&self, a: ActionIdx) -> Range<usize> {
        self.outcome_start[a.index()] as usize..self.outcome_start[a.index() + 1] as usize
    }

    #[must_use]
    pub fn targets(&self, a: ActionIdx) -> &[StateIdx] {
        &self.targets[self.outcome_range(a)]
    }

    #[must_use]
    pub fn probabilities(&self, a: ActionIdx) -> &[f64] {
        &self.probabilities[self.outcome_range(a)]
    }

    #[must_use]
    pub fn rewards(&self, a: ActionIdx) -> &[f64] {
        &self.rewards[self.outcome_range(a)]
    }

    #[must_use]
    pub fn transition_ids(&self, a: ActionIdx) -> &[String] {
        &self.transition_ids[self.outcome_range(a)]
    }

    #[must_use]
    pub fn source(&self, a: ActionIdx) -> StateIdx {
        self.action_source[a.index()]
    }

    #[must_use]
    pub fn state_id(&self, s: StateIdx) -> &str {
        &self.state_ids[s.index()]
    }

    #[must_use]
    pub fn state_label(&self, s: StateIdx) -> &str {
        &self.state_labels[s.index()]
    }

    #[must_use]
    pub fn action_id(&self, a: ActionIdx) -> &str {
        &self.action_ids[a.index()]
    }

    #[must_use]
    pub fn action_label(&self, a: ActionIdx) -> &str {
        &self.action_labels[a.index()]
    }

    #[must_use]
    pub fn state_by_id(&self, id: &str) -> Option<StateIdx> {
        self.state_index.get(id).copied()
    }

    #[must_use]
    pub fn action_by_id(&self, id: &str) -> Option<ActionIdx> {
        self.action_index.get(id).copied()
    }
}
