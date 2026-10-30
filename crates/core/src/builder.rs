use crate::error::ModelError;
use crate::mdp::{Mdp, MdpMetadata};

#[derive(Debug, Clone, PartialEq)]
pub struct State {
    pub id: String,
    pub label: String,
    pub actions: Vec<Action>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Action {
    pub id: String,
    pub label: String,
    pub transitions: Vec<Transition>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Transition {
    pub id: String,
    pub target_state_id: String,
    pub probability: f64,
    pub reward: i32,
}

impl State {
    pub fn new(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            actions: Vec::new(),
        }
    }

    #[must_use]
    pub fn action(mut self, a: Action) -> Self {
        self.actions.push(a);
        self
    }
}

impl Action {
    pub fn new(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            transitions: Vec::new(),
        }
    }

    #[must_use]
    pub fn transition(mut self, t: Transition) -> Self {
        self.transitions.push(t);
        self
    }
}

impl Transition {
    pub fn new(
        id: impl Into<String>,
        target_state_id: impl Into<String>,
        probability: f64,
    ) -> Self {
        Self {
            id: id.into(),
            target_state_id: target_state_id.into(),
            probability,
            reward: 0,
        }
    }

    #[must_use]
    pub fn reward(mut self, new_reward: i32) -> Self {
        self.reward = new_reward;
        self
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct MdpBuilder {
    pub(crate) states: Vec<State>,
    pub(crate) initial: Option<String>,
}

#[derive(Debug,Clone, Copy, PartialEq, Eq)]
pub struct StateRef(usize);

impl MdpBuilder {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// # Errors
    /// If the mdp is not consistent
    pub fn build(self) -> Result<(Mdp, MdpMetadata), ModelError> {
        Mdp::from_builder(self)
    }

    pub fn add_state(&mut self, s: State) -> StateRef {
        self.states.push(s);
        StateRef(self.states.len()-1)
    }

    pub fn add_action(&mut self, s: StateRef, a: Action) -> &mut Self {
        self.states[s.0].actions.push(a);
        self
    }

    // pub fn add_transition(&mut self, t: Transition) -> &mut Self {
    //     self.transitions.push(t);
    //     self
    // }

    pub fn set_initial(&mut self, initial_id: impl Into<String>) -> &mut Self {
        self.initial = Some(initial_id.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    fn ids<T>(items: &[T], id: impl Fn(&T) -> &str) -> Vec<&str> {
        items.iter().map(id).collect()
    }

    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-12,
            "expected {expected}, got {actual}"
        );
    }

    #[test]
    fn new_builder_is_empty() {
        let builder = MdpBuilder::new();
        assert!(builder.states.is_empty());
        assert_eq!(builder.initial, None);
    }

    #[test]
    fn constructors_set_defaults() {
        let state = State::new("s0", "ok");
        assert_eq!(state.id, "s0");
        assert_eq!(state.label, "ok");
        assert!(state.actions.is_empty());

        let action = Action::new("a0", "run");
        assert_eq!(action.id, "a0");
        assert_eq!(action.label, "run");
        assert!(action.transitions.is_empty());

        let transition = Transition::new("t0", "s1", 0.5);
        assert_eq!(transition.id, "t0");
        assert_eq!(transition.target_state_id, "s1");
        assert_close(transition.probability, 0.5);
        assert_eq!(transition.reward, 0);
    }

    #[test]
    fn setters_nest_in_order() {
        let state = State::new("s0", "ok")
            .action(
                Action::new("a0", "run")
                    .transition(Transition::new("t0", "s0", 0.5))
                    .transition(Transition::new("t1", "s1", 0.5)),
            )
            .action(Action::new("a1", "wait"));
        assert_eq!(ids(&state.actions, |a| &a.id), ["a0", "a1"]);
        assert_eq!(ids(&state.actions[0].transitions, |t| &t.id), ["t0", "t1"]);
        assert!(state.actions[1].transitions.is_empty());
    }

    #[test]
    fn reward_setter_changes_only_the_reward() {
        let transition = Transition::new("t0", "s1", 0.5).reward(-3);
        assert_eq!(transition.reward, -3);
        assert_close(transition.probability, 0.5);
    }

    #[test]
    fn example_has_the_fixture_shape() {
        let builder = example();
        assert_eq!(ids(&builder.states, |s| &s.id), ["s0", "s1"]);
        assert_eq!(ids(&builder.states[0].actions, |a| &a.id), ["a0", "a1"]);
        assert_eq!(builder.states[0].actions[0].transitions[0].reward, 2);
        assert!(builder.states[1].actions.is_empty());
        assert_eq!(builder.initial.as_deref(), Some("s0"));
    }

    #[test]
    fn add_state_returns_a_handle_per_state() {
        let mut builder = MdpBuilder::new();
        let s0 = builder.add_state(State::new("s0", "ok"));
        let s1 = builder.add_state(State::new("s1", "broken"));
        assert_ne!(s0, s1);
        assert_eq!(ids(&builder.states, |s| &s.id), ["s0", "s1"]);
    }

    #[test]
    fn add_action_appends_to_that_state() {
        let mut builder = MdpBuilder::new();
        let s0 = builder.add_state(State::new("s0", "ok").action(Action::new("a0", "run")));
        let s1 = builder.add_state(State::new("s1", "broken"));
        builder
            .add_action(s0, Action::new("a1", "repair"))
            .add_action(s1, Action::new("b0", "wait"))
            .add_action(s0, Action::new("a2", "stop"));
        assert_eq!(
            ids(&builder.states[0].actions, |a| &a.id),
            ["a0", "a1", "a2"]
        );
        assert_eq!(ids(&builder.states[1].actions, |a| &a.id), ["b0"]);
    }

    #[test]
    fn actions_can_be_built_separately() {
        // A helper that produces actions, as when generating a model.
        fn coin(id: &str, heads: &str, tails: &str) -> Action {
            Action::new(id, "flip")
                .transition(Transition::new(format!("{id}-heads"), heads, 0.5))
                .transition(Transition::new(format!("{id}-tails"), tails, 0.5))
        }

        let mut builder = MdpBuilder::new();
        let s0 = builder.add_state(State::new("s0", "s"));
        let s1 = builder.add_state(State::new("s1", "s"));
        builder
            .add_action(s0, coin("a0", "s0", "s1"))
            .add_action(s1, coin("a1", "s1", "s0"));
        let flip = &builder.states[1].actions[0];
        assert_eq!(ids(&flip.transitions, |t| &t.id), ["a1-heads", "a1-tails"]);
        assert_eq!(flip.transitions[1].target_state_id, "s0");
    }

    #[test]
    fn builder_can_be_filled_in_a_loop() {
        let mut builder = MdpBuilder::new();
        let refs: Vec<StateRef> = (0..3)
            .map(|i| builder.add_state(State::new(format!("s{i}"), "s")))
            .collect();
        for (i, &s) in refs.iter().enumerate() {
            let next = format!("s{}", (i + 1) % 3);
            builder.add_action(
                s,
                Action::new(format!("a{i}"), "next").transition(Transition::new(
                    format!("t{i}"),
                    next,
                    1.0,
                )),
            );
        }
        assert_eq!(ids(&builder.states, |s| &s.id), ["s0", "s1", "s2"]);
        assert_eq!(
            builder.states[2].actions[0].transitions[0].target_state_id,
            "s0"
        );
    }

    #[test]
    fn last_set_initial_wins() {
        let mut builder = example();
        builder.set_initial("s1");
        assert_eq!(builder.initial.as_deref(), Some("s1"));
    }

    #[test]
    fn same_target_with_different_rewards_is_kept_twice() {
        let action = Action::new("a0", "x")
            .transition(Transition::new("t0", "s1", 0.3).reward(5))
            .transition(Transition::new("t1", "s1", 0.2).reward(-1));
        assert_eq!(action.transitions.len(), 2);
        assert_eq!(action.transitions[0].reward, 5);
        assert_eq!(action.transitions[1].reward, -1);
    }

    #[test]
    fn builder_stores_invalid_input_without_checking() {
        // Validation is the job of `build()`, not of `add_*`.
        let mut builder = MdpBuilder::new();
        let s0 = builder.add_state(State::new("s0", "ok"));
        builder.add_state(State::new("s0", "duplicate id"));
        builder
            .add_action(
                s0,
                Action::new("a0", "run").transition(Transition::new("t0", "missing", f64::NAN)),
            )
            .set_initial("missing");
        assert_eq!(builder.states.len(), 2);
        assert!(
            builder.states[0].actions[0].transitions[0]
                .probability
                .is_nan()
        );
    }
}
