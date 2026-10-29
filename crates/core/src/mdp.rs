use crate::{Action, MdpBuilder, ModelError, Transition};
use std::collections::{HashMap, HashSet};
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
    // indexed by state id
    action_start: Vec<u32>,
    // indexed by action id
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
    action_source: Vec<StateIdx>,
    action_index: HashMap<String, ActionIdx>,

    transition_ids: Vec<String>,
}

impl Mdp {
    /// The only constructor; called by `MdpBuilder::build`.
    ///
    /// Pass 1 checks the input by reference, in the order of CLAUDE.md §3.2,
    /// and records only what it resolved. Pass 2 groups actions by source
    /// state and transitions by action (keeping the input order inside each
    /// group) and moves every string out exactly once.
    pub(crate) fn from_builder(mdp_builder: MdpBuilder) -> Result<(Mdp, MdpMetadata), ModelError> {
        let MdpBuilder {
            states,
            mut actions,
            mut transitions,
            initial: initial_id,
        } = mdp_builder;
        let num_states = states.len();
        let num_actions = actions.len();
        let num_transitions = transitions.len();

        // States are never reordered, so these vectors are already final.
        let mut state_ids: Vec<String> = Vec::with_capacity(num_states);
        let mut state_labels: Vec<String> = Vec::with_capacity(num_states);
        let mut state_index: HashMap<String, StateIdx> = HashMap::with_capacity(num_states);
        for (i, state) in states.into_iter().enumerate() {
            let prev = state_index.insert(state.id.clone(), StateIdx(from_usize_to_u32(i)?));
            if prev.is_some() {
                return Err(ModelError::DuplicateStateId(state.id));
            }
            state_ids.push(state.id);
            state_labels.push(state.label);
        }

        let (mut action_index, actions_by_state) = check_actions(&actions, &state_index)?;
        let (transition_targets, transitions_by_action) =
            check_transitions(&transitions, &action_index, &state_index)?;

        // The initial state is checked last.
        let initial_id = initial_id.ok_or(ModelError::NoInitialState)?;
        let Some(&initial) = state_index.get(&initial_id) else {
            return Err(ModelError::UnknownInitialState(initial_id));
        };

        // ---- Pass 2: grouping (CSR) ----
        let mut action_start: Vec<u32> = Vec::with_capacity(num_states + 1);
        let mut outcome_start: Vec<u32> = Vec::with_capacity(num_actions + 1);
        let mut targets: Vec<StateIdx> = Vec::with_capacity(num_transitions);
        let mut probabilities: Vec<f64> = Vec::with_capacity(num_transitions);
        let mut rewards: Vec<i32> = Vec::with_capacity(num_transitions);
        let mut action_ids: Vec<String> = Vec::with_capacity(num_actions);
        let mut action_labels: Vec<String> = Vec::with_capacity(num_actions);
        let mut action_source: Vec<StateIdx> = Vec::with_capacity(num_actions);
        let mut transition_ids: Vec<String> = Vec::with_capacity(num_transitions);

        action_start.push(0);
        outcome_start.push(0);
        // `(0u32..).zip` numbers the states without a `usize as u32` cast.
        for (s, group) in (0u32..).zip(&actions_by_state) {
            for &a in group {
                // `mem::take` moves the String out and leaves "" behind.
                let id = std::mem::take(&mut actions[a].id);
                if let Some(index) = action_index.get_mut(&id) {
                    *index = ActionIdx(from_usize_to_u32(action_ids.len())?);
                }
                action_ids.push(id);
                action_labels.push(std::mem::take(&mut actions[a].label));
                action_source.push(StateIdx(s));

                for &t in &transitions_by_action[a] {
                    let transition = &mut transitions[t];
                    targets.push(transition_targets[t]);
                    probabilities.push(transition.probability);
                    rewards.push(transition.reward);
                    transition_ids.push(std::mem::take(&mut transition.id));
                }
                outcome_start.push(from_usize_to_u32(targets.len())?);
            }
            action_start.push(from_usize_to_u32(action_ids.len())?);
        }

        let mdp = Mdp {
            initial,
            action_start,
            outcome_start,
            targets,
            probabilities,
            rewards,
        };
        let metadata = MdpMetadata {
            state_ids,
            state_labels,
            state_index,
            action_ids,
            action_labels,
            action_source,
            action_index,
            transition_ids,
        };
        Ok((mdp, metadata))
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
    pub fn targets(&self, a: ActionIdx) -> &[StateIdx] {
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

    #[must_use]
    pub fn source(&self, a: ActionIdx) -> StateIdx {
        self.action_source[a.index()]
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

//helpers
/// For each group (a state or an action), the input positions of its
/// members, in input order.
type Groups = Vec<Vec<usize>>;

/// Pass 1 for actions, in input order: duplicate ids and unknown sources.
/// Returns the id -> input position map (pass 2 replaces the positions with
/// the final `ActionIdx`) and the input positions of the actions of each state.
fn check_actions(
    actions: &[Action],
    state_index: &HashMap<String, StateIdx>,
) -> Result<(HashMap<String, ActionIdx>, Groups), ModelError> {
    let mut action_index: HashMap<String, ActionIdx> = HashMap::with_capacity(actions.len());
    let mut actions_by_state: Groups = vec![Vec::new(); state_index.len()];
    for (i, action) in actions.iter().enumerate() {
        let prev = action_index.insert(action.id.clone(), ActionIdx(from_usize_to_u32(i)?));
        if prev.is_some() {
            return Err(ModelError::DuplicateActionId(action.id.clone()));
        }
        let source = state_index
            .get(&action.source_state_id)
            .copied()
            .ok_or_else(|| ModelError::UnknownSourceState {
                action: action.id.clone(),
                state: action.source_state_id.clone(),
            })?;
        actions_by_state[source.index()].push(i);
    }
    Ok((action_index, actions_by_state))
}

/// Pass 1 for transitions, in input order: duplicate ids, unknown actions and
/// targets, invalid probabilities. Returns the target of each transition (by
/// input position) and the input positions of the transitions of each action.
fn check_transitions(
    transitions: &[Transition],
    action_index: &HashMap<String, ActionIdx>,
    state_index: &HashMap<String, StateIdx>,
) -> Result<(Vec<StateIdx>, Groups), ModelError> {
    // Borrows the ids, so no String is cloned to detect duplicates.
    let mut seen_ids: HashSet<&str> = HashSet::with_capacity(transitions.len());
    let mut targets: Vec<StateIdx> = Vec::with_capacity(transitions.len());
    let mut transitions_by_action: Groups = vec![Vec::new(); action_index.len()];
    for (i, transition) in transitions.iter().enumerate() {
        if !seen_ids.insert(&transition.id) {
            return Err(ModelError::DuplicateTransitionId(transition.id.clone()));
        }
        let action = action_index
            .get(&transition.action_id)
            .copied()
            .ok_or_else(|| ModelError::UnknownAction {
                transition: transition.id.clone(),
                action: transition.action_id.clone(),
            })?;
        let target = state_index
            .get(&transition.target_state_id)
            .copied()
            .ok_or_else(|| ModelError::UnknownTargetState {
                transition: transition.id.clone(),
                state: transition.target_state_id.clone(),
            })?;
        // NaN and the infinities are outside the range too.
        if !(0.0..=1.0).contains(&transition.probability) {
            return Err(ModelError::InvalidProbability {
                transition: transition.id.clone(),
                value: transition.probability,
            });
        }
        transitions_by_action[action.index()].push(i);
        targets.push(target);
    }
    Ok((targets, transitions_by_action))
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
        mdp.targets(action(meta, a))
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
        assert_eq!(meta.source(a0), state(&meta, "s0"));

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
        assert_eq!(meta.source(action(&meta, "b1")), state(&meta, "s1"));
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
        assert!(mdp.targets(action(&meta, "a1")).is_empty());
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
    fn actions_and_transitions_are_checked_depth_first() {
        // A bad probability in s0 is found before a duplicate action in s1,
        // and both before the unknown initial state.
        let mut builder = MdpBuilder::new();
        builder.add_state(
            State::new("s0", "s")
                .action(Action::new("a0", "x").transition(Transition::new("t0", "s1", 2.0))),
        );
        builder.add_state(State::new("s1", "s").action(Action::new("a0", "again")));
        builder.set_initial("nowhere");
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
