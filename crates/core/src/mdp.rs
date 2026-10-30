use crate::{MdpBuilder, ModelError};
use std::collections::HashMap;
use std::collections::hash_map::Entry;
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
    initial: StateIdx,
    // actions of state s:
    // action_start[s]..action_start[s+1]
    action_start: Vec<u32>,
    // outcomes of actions a:
    // outcome_start[a]..outcome_start[a+1]
    outcome_start: Vec<u32>,
    targets: Vec<StateIdx>,
    //TODO test converge and speed with Vec<f32>
    probabilities: Vec<f64>,
    rewards: Vec<i32>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MdpMetadata {
    state_ids: Vec<String>,
    state_labels: Vec<String>,
    state_index: HashMap<String, StateIdx>,

    action_ids: Vec<String>,
    action_labels: Vec<String>,
    action_index: HashMap<String, ActionIdx>,

    transition_ids: Vec<String>,
}

impl Mdp {
    pub(crate) fn from_builder(mdp_builder: MdpBuilder) -> Result<(Mdp, MdpMetadata), ModelError> {
        // Metadata
        let num_states = mdp_builder.states.len();
        let mut state_ids: Vec<String> = Vec::with_capacity(num_states);
        let mut state_labels: Vec<String> = Vec::with_capacity(num_states);
        let mut state_index: HashMap<String, StateIdx> = HashMap::with_capacity(num_states);

        for state in &mdp_builder.states {
            match state_index.entry(state.id.clone()) {
                Entry::Occupied(_) => {
                    return Err(ModelError::DuplicateStateId(state.id.clone()));
                }
                Entry::Vacant(vacant) => {
                    let i: usize = state_ids.len();
                    vacant.insert(StateIdx(from_usize_to_u32(i)?));
                }
            }
            state_ids.push(state.id.clone());
            state_labels.push(state.label.clone());
        }

        // Checking if initial state exists
        let Some(initial_builder) = mdp_builder.initial else {
            return Err(ModelError::NoInitialState);
        };

        let initial_id = state_index.get(&initial_builder);
        // Mdp Core
        let Some(&initial) = initial_id else {
            return Err(ModelError::UnknownInitialState(initial_builder));
        };

        let mut action_start: Vec<u32> = Vec::with_capacity(num_states + 1);
        let mut outcome_start: Vec<u32> = Vec::new();

        let mut targets: Vec<StateIdx> = Vec::new();
        let mut probabilities: Vec<f64> = Vec::new();
        let mut rewards: Vec<i32> = Vec::new();

        let mut action_ids: Vec<String> = Vec::new();
        let mut action_labels: Vec<String> = Vec::new();
        let mut action_index: HashMap<String, ActionIdx> = HashMap::new();

        let mut transition_ids: Vec<String> = Vec::new();
        let mut transition_index: HashMap<String, u32> = HashMap::new();

        for state in mdp_builder.states {
            action_start.push(from_usize_to_u32(action_ids.len())?);
            for action in state.actions {
                outcome_start.push(from_usize_to_u32(transition_ids.len())?);
                match action_index.entry(action.id.clone()) {
                    Entry::Occupied(_) => {
                        return Err(ModelError::DuplicateActionId(action.id));
                    }
                    Entry::Vacant(vacant) => {
                        let i: usize = action_ids.len();
                        vacant.insert(ActionIdx(from_usize_to_u32(i)?));
                    }
                }
                action_ids.push(action.id);
                action_labels.push(action.label);

                for transition in action.transitions {
                    match transition_index.entry(transition.id.clone()) {
                        Entry::Occupied(_) => {
                            return Err(ModelError::DuplicateTransitionId(transition.id));
                        }
                        Entry::Vacant(vacant) => {
                            let i: usize = transition_ids.len();
                            vacant.insert(from_usize_to_u32(i)?);
                        }
                    }
                    let Some(target_id) = state_index.get(&transition.target_state_id) else {
                        return Err(ModelError::UnknownTargetState {
                            transition: transition.id,
                            state: transition.target_state_id,
                        });
                    };
                    if transition.probability.is_nan()
                        || transition.probability < 0.0
                        || transition.probability > 1.0
                    {
                        return Err(ModelError::InvalidProbability {
                            transition: transition.id,
                            value: transition.probability,
                        });
                    }
                    transition_ids.push(transition.id.clone());
                    targets.push(*target_id);
                    probabilities.push(transition.probability);
                    rewards.push(transition.reward);
                }
            }
        }

        action_start.push(from_usize_to_u32(action_ids.len())?);
        outcome_start.push(from_usize_to_u32(transition_ids.len())?);
        Ok((
            Mdp {
                initial,
                action_start,
                outcome_start,
                targets,
                probabilities,
                rewards,
            },
            MdpMetadata {
                state_ids,
                state_labels,
                state_index,

                action_ids,
                action_labels,
                action_index,

                transition_ids,
            },
        ))
    }
}

impl Mdp {
    // For algorithms
    #[must_use]
    pub fn initial_state(&self) -> StateIdx {
        self.initial
    }

    pub fn states(&self) -> impl Iterator<Item = StateIdx> + use<> {
        (0..).take(self.num_states()).map(StateIdx)
    }

    #[must_use]
    pub fn num_states(&self) -> usize {
        self.action_start.len() - 1
    }

    #[must_use]
    pub fn num_actions(&self) -> usize {
        self.outcome_start.len() - 1
    }

    pub fn actions(&self, s: StateIdx) -> impl ExactSizeIterator<Item = ActionIdx> + use<> {
        (self.action_start[s.index()]..self.action_start[s.index() + 1]).map(ActionIdx)
    }

    fn outcome_range(&self, a: ActionIdx) -> Range<usize> {
        self.outcome_start[a.index()] as usize..self.outcome_start[a.index() + 1] as usize
    }

    #[must_use]
    pub fn successors(&self, a: ActionIdx) -> &[StateIdx] {
        &self.targets[self.outcome_range(a)]
    }

    #[must_use]
    pub fn probabilities(&self, a: ActionIdx) -> &[f64] {
        &self.probabilities[self.outcome_range(a)]
    }

    #[must_use]
    pub fn rewards(&self, a: ActionIdx) -> &[i32] {
        &self.rewards[self.outcome_range(a)]
    }

    /// # Panics
    /// Never for any action from this `Mdp`
    #[must_use]
    pub fn source(&self, a: ActionIdx) -> StateIdx {
        debug_assert!(
            a.index() < self.num_actions(),
            "action id is larger than num of actions"
        );
        let s = self.action_start.partition_point(|&start| start <= a.0) - 1;
        StateIdx(u32::try_from(s).expect("Unexpected: state index should fits in u32"))
    }
}

impl MdpMetadata {
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

    /// The transition ids of `a`, parallel to `mdp.targets(a)`.
    #[must_use]
    pub fn transition_ids<'a>(&'a self, mdp: &Mdp, a: ActionIdx) -> &'a [String] {
        &self.transition_ids[mdp.outcome_range(a)]
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

fn from_usize_to_u32(index: usize) -> Result<u32, ModelError> {
    u32::try_from(index).map_err(|_| ModelError::Overflow)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Action, State, Transition};

    /// The model of `fixtures/models/example.mdp.json`, nested.
    fn example() -> MdpBuilder {
        let mut builder = MdpBuilder::new();
        builder.add_state(
            State::new("s0", "ok")
                .action(
                    Action::new("a0", "run")
                        .transition(Transition::new("t0", "s0", 0.9).reward(2))
                        .transition(Transition::new("t1", "s1", 0.1)),
                )
                .action(
                    Action::new("a1", "repair")
                        .transition(Transition::new("t2", "s0", 1.0).reward(-1)),
                ),
        );
        builder.add_state(State::new("s1", "broken"));
        builder.set_initial("s0");
        builder
    }

    fn state(meta: &MdpMetadata, id: &str) -> StateIdx {
        meta.state_by_id(id).unwrap()
    }

    fn action(meta: &MdpMetadata, id: &str) -> ActionIdx {
        meta.action_by_id(id).unwrap()
    }

    /// Ids of the actions of `s`, in `Mdp` order.
    fn action_ids<'a>(mdp: &Mdp, meta: &'a MdpMetadata, s: &str) -> Vec<&'a str> {
        mdp.actions(state(meta, s))
            .map(|a| meta.action_id(a))
            .collect()
    }

    /// Ids of the targets of `a`, in `Mdp` order.
    fn target_ids<'a>(mdp: &Mdp, meta: &'a MdpMetadata, a: &str) -> Vec<&'a str> {
        mdp.successors(action(meta, a))
            .iter()
            .map(|&t| meta.state_id(t))
            .collect()
    }

    fn build_err(builder: MdpBuilder) -> ModelError {
        match builder.build() {
            Ok(_) => panic!("expected an error"),
            Err(e) => e,
        }
    }

    // ---- valid models ----

    #[test]
    fn example_builds_into_csr() {
        let (mdp, meta) = example().build().unwrap();

        assert_eq!(mdp.num_states(), 2);
        assert_eq!(mdp.num_actions(), 2);
        assert_eq!(mdp.initial_state(), state(&meta, "s0"));
        assert_eq!(action_ids(&mdp, &meta, "s0"), ["a0", "a1"]);
        assert!(action_ids(&mdp, &meta, "s1").is_empty());

        let a0 = action(&meta, "a0");
        assert_eq!(target_ids(&mdp, &meta, "a0"), ["s0", "s1"]);
        assert_eq!(mdp.probabilities(a0), [0.9, 0.1]);
        assert_eq!(mdp.rewards(a0), [2, 0]);
        assert_eq!(meta.transition_ids(&mdp, a0), ["t0", "t1"]);

        let a1 = action(&meta, "a1");
        assert_eq!(target_ids(&mdp, &meta, "a1"), ["s0"]);
        assert_eq!(mdp.rewards(a1), [-1]);
    }

    #[test]
    fn states_keep_input_order() {
        let (mdp, meta) = example().build().unwrap();
        let ids: Vec<&str> = mdp.states().map(|s| meta.state_id(s)).collect();
        assert_eq!(ids, ["s0", "s1"]);
        assert_eq!(meta.state_label(state(&meta, "s1")), "broken");
    }

    #[test]
    fn actions_are_numbered_state_by_state() {
        // Nested and appended actions, added in an interleaved order.
        let mut builder = MdpBuilder::new();
        let s0 = builder.add_state(State::new("s0", "s").action(Action::new("a0", "x")));
        let s1 = builder.add_state(State::new("s1", "s").action(Action::new("b0", "x")));
        builder
            .add_action(s1, Action::new("b1", "y"))
            .add_action(s0, Action::new("a1", "y"))
            .set_initial("s0");
        let (mdp, meta) = builder.build().unwrap();

        assert_eq!(action_ids(&mdp, &meta, "s0"), ["a0", "a1"]);
        assert_eq!(action_ids(&mdp, &meta, "s1"), ["b0", "b1"]);
        // `ActionIdx` follows the state-by-state order, and `action_by_id` agrees.
        let all: Vec<&str> = mdp
            .states()
            .flat_map(|s| mdp.actions(s))
            .map(|a| meta.action_id(a))
            .collect();
        assert_eq!(all, ["a0", "a1", "b0", "b1"]);
        assert_eq!(action(&meta, "b0").index(), 2);
        assert_eq!(meta.action_label(action(&meta, "b1")), "y");
    }

    #[test]
    fn transitions_keep_their_order() {
        let mut builder = MdpBuilder::new();
        builder.add_state(
            State::new("s0", "s")
                .action(
                    Action::new("a0", "x")
                        .transition(Transition::new("t1", "s1", 0.5))
                        .transition(Transition::new("t3", "s0", 0.5)),
                )
                .action(Action::new("a1", "y")),
        );
        builder.add_state(State::new("s1", "s"));
        builder.set_initial("s0");
        let (mdp, meta) = builder.build().unwrap();

        assert_eq!(target_ids(&mdp, &meta, "a0"), ["s1", "s0"]);
        assert_eq!(meta.transition_ids(&mdp, action(&meta, "a0")), ["t1", "t3"]);
        assert!(mdp.successors(action(&meta, "a1")).is_empty());
    }

    #[test]
    fn targets_may_refer_to_later_states() {
        let mut builder = MdpBuilder::new();
        builder.add_state(
            State::new("s0", "s")
                .action(Action::new("a0", "x").transition(Transition::new("t0", "s2", 1.0))),
        );
        builder.add_state(State::new("s1", "s"));
        builder.add_state(State::new("s2", "s"));
        builder.set_initial("s0");
        let (mdp, meta) = builder.build().unwrap();
        assert_eq!(target_ids(&mdp, &meta, "a0"), ["s2"]);
    }

    #[test]
    fn same_target_twice_is_kept_twice() {
        let mut builder = MdpBuilder::new();
        builder.add_state(
            State::new("s0", "s").action(
                Action::new("a0", "x")
                    .transition(Transition::new("t0", "s1", 0.3).reward(5))
                    .transition(Transition::new("t1", "s1", 0.2).reward(-1))
                    .transition(Transition::new("t2", "s0", 0.5)),
            ),
        );
        builder.add_state(State::new("s1", "s"));
        builder.set_initial("s0");
        let (mdp, meta) = builder.build().unwrap();
        let a0 = action(&meta, "a0");
        assert_eq!(target_ids(&mdp, &meta, "a0"), ["s1", "s1", "s0"]);
        assert_eq!(mdp.probabilities(a0), [0.3, 0.2, 0.5]);
        assert_eq!(mdp.rewards(a0), [5, -1, 0]);
    }

    #[test]
    fn probability_bounds_are_valid() {
        let mut builder = example();
        builder.add_state(
            State::new("s2", "s").action(
                Action::new("a2", "x")
                    .transition(Transition::new("t3", "s0", 0.0))
                    .transition(Transition::new("t4", "s1", 1.0)),
            ),
        );
        assert!(builder.build().is_ok());
    }

    #[test]
    fn source_finds_the_state_of_each_action() {
        // s1 has no actions, so s0 and s2 are next to each other in `action_start`.
        let mut builder = MdpBuilder::new();
        builder.add_state(
            State::new("s0", "s")
                .action(Action::new("a0", "x"))
                .action(Action::new("a1", "y")),
        );
        builder.add_state(State::new("s1", "s"));
        builder.add_state(State::new("s2", "s").action(Action::new("b0", "x")));
        builder.add_state(State::new("s3", "s"));
        builder.set_initial("s0");
        let (mdp, meta) = builder.build().unwrap();

        for (a, s) in [("a0", "s0"), ("a1", "s0"), ("b0", "s2")] {
            assert_eq!(
                mdp.source(action(&meta, a)),
                state(&meta, s),
                "source of {a}"
            );
        }
        // Every action is in the action list of its source.
        for s in mdp.states() {
            for a in mdp.actions(s) {
                assert_eq!(mdp.source(a), s);
            }
        }
    }

    // ---- errors ----

    #[test]
    fn duplicate_state_id() {
        let mut builder = example();
        builder.add_state(State::new("s1", "again"));
        assert!(matches!(build_err(builder), ModelError::DuplicateStateId(id) if id == "s1"));
    }

    #[test]
    fn duplicate_action_id_across_states() {
        let mut builder = example();
        builder.add_state(State::new("s2", "s").action(Action::new("a0", "again")));
        assert!(matches!(build_err(builder), ModelError::DuplicateActionId(id) if id == "a0"));
    }

    #[test]
    fn duplicate_transition_id_across_actions() {
        let mut builder = example();
        builder.add_state(
            State::new("s2", "s")
                .action(Action::new("a2", "x").transition(Transition::new("t1", "s0", 1.0))),
        );
        assert!(matches!(build_err(builder), ModelError::DuplicateTransitionId(id) if id == "t1"));
    }

    #[test]
    fn unknown_target_state() {
        let mut builder = example();
        builder.add_state(
            State::new("s2", "s")
                .action(Action::new("a2", "x").transition(Transition::new("t3", "nowhere", 1.0))),
        );
        assert!(matches!(
            build_err(builder),
            ModelError::UnknownTargetState { transition, state }
                if transition == "t3" && state == "nowhere"
        ));
    }

    #[test]
    fn invalid_probabilities() {
        for p in [-0.1, 1.1, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let mut builder = example();
            builder.add_state(
                State::new("s2", "s")
                    .action(Action::new("a2", "x").transition(Transition::new("t3", "s1", p))),
            );
            assert!(
                matches!(
                    build_err(builder),
                    ModelError::InvalidProbability { ref transition, .. } if transition == "t3"
                ),
                "probability {p} should be rejected"
            );
        }
    }

    #[test]
    fn no_initial_state() {
        let mut builder = example();
        builder.initial = None;
        assert!(matches!(build_err(builder), ModelError::NoInitialState));
    }

    #[test]
    fn unknown_initial_state() {
        let mut builder = example();
        builder.set_initial("nowhere");
        assert!(
            matches!(build_err(builder), ModelError::UnknownInitialState(id) if id == "nowhere")
        );
    }

    #[test]
    fn empty_model_needs_an_initial_state() {
        assert!(matches!(
            build_err(MdpBuilder::new()),
            ModelError::NoInitialState
        ));
    }

    // ---- order of the checks (CLAUDE.md §3.2) ----

    #[test]
    fn duplicate_states_are_found_before_anything_else() {
        // The duplicate state comes last, after a broken transition.
        let mut builder = MdpBuilder::new();
        builder.add_state(
            State::new("s0", "s")
                .action(Action::new("a0", "x").transition(Transition::new("t0", "nowhere", 2.0))),
        );
        builder.add_state(State::new("s0", "again"));
        assert!(matches!(
            build_err(builder),
            ModelError::DuplicateStateId(_)
        ));
    }

    #[test]
    fn initial_state_is_checked_after_states_before_actions() {
        // A bad transition comes first in the input, but the initial state
        // is checked right after the states.
        let mut builder = MdpBuilder::new();
        builder.add_state(
            State::new("s0", "s")
                .action(Action::new("a0", "x").transition(Transition::new("t0", "s0", 2.0))),
        );
        builder.set_initial("nowhere");
        assert!(matches!(
            build_err(builder.clone()),
            ModelError::UnknownInitialState(_)
        ));

        builder.initial = None;
        assert!(matches!(build_err(builder), ModelError::NoInitialState));
    }

    #[test]
    fn actions_and_transitions_are_checked_depth_first() {
        // A bad probability in s0 is found before a duplicate action in s1.
        let mut builder = MdpBuilder::new();
        builder.add_state(
            State::new("s0", "s")
                .action(Action::new("a0", "x").transition(Transition::new("t0", "s1", 2.0))),
        );
        builder.add_state(State::new("s1", "s").action(Action::new("a0", "again")));
        builder.set_initial("s0");
        assert!(matches!(
            build_err(builder),
            ModelError::InvalidProbability { .. }
        ));
    }

    #[test]
    fn an_action_is_checked_before_its_transitions() {
        let mut builder = example();
        builder.add_state(
            State::new("s2", "s")
                .action(Action::new("a0", "again").transition(Transition::new("t9", "s0", 2.0))),
        );
        assert!(matches!(
            build_err(builder),
            ModelError::DuplicateActionId(_)
        ));
    }

    #[test]
    fn a_transition_is_checked_id_then_target_then_probability() {
        // Duplicate id and bad probability: the id wins.
        let mut builder = example();
        builder.add_state(
            State::new("s2", "s")
                .action(Action::new("a2", "x").transition(Transition::new("t0", "nowhere", 2.0))),
        );
        assert!(matches!(
            build_err(builder),
            ModelError::DuplicateTransitionId(_)
        ));

        // Unknown target and bad probability: the target wins.
        let mut builder = example();
        builder.add_state(
            State::new("s2", "s")
                .action(Action::new("a2", "x").transition(Transition::new("t3", "nowhere", 2.0))),
        );
        assert!(matches!(
            build_err(builder),
            ModelError::UnknownTargetState { .. }
        ));
    }
}
