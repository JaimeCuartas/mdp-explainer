#[derive(Debug, Clone)]
pub struct State {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone)]
pub struct Action {
    pub id: String,
    pub label: String,
    pub source_state_id: String,
}

#[derive(Debug, Clone)]
pub struct Transition {
    pub id: String,
    pub action_id: String,
    pub target_state_id: String,
    pub probability: f64,
    pub reward: f64,
}

impl State {
    pub fn new(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
        }
    }
}

impl Action {
    pub fn new(
        id: impl Into<String>,
        label: impl Into<String>,
        source_state_id: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            source_state_id: source_state_id.into(),
        }
    }
}

impl Transition {
    pub fn new(
        id: impl Into<String>,
        action_id: impl Into<String>,
        target_state_id: impl Into<String>,
        probability: f64,
    ) -> Self {
        Self {
            id: id.into(),
            action_id: action_id.into(),
            target_state_id: target_state_id.into(),
            probability,
            reward: 0.0,
        }
    }

    #[must_use]
    pub fn reward(mut self, new_reward: f64) -> Self {
        self.reward = new_reward;
        self
    }
}

#[derive(Debug, Clone, Default)]
pub struct MdpBuilder {
    pub(crate) states: Vec<State>,
    pub(crate) actions: Vec<Action>,
    pub(crate) transitions: Vec<Transition>,
    pub(crate) initial: Option<String>,
}

impl MdpBuilder {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_state(&mut self, s: State) -> &mut Self {
        self.states.push(s);
        self
    }

    pub fn add_action(&mut self, a: Action) -> &mut Self {
        self.actions.push(a);
        self
    }

    pub fn add_transition(&mut self, t: Transition) -> &mut Self {
        self.transitions.push(t);
        self
    }

    pub fn set_initial(&mut self, initial_id: impl Into<String>) -> &mut Self {
        self.initial = Some(initial_id.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn example() -> MdpBuilder {
        let mut builder = MdpBuilder::new();
        builder
            .add_state(State::new("s0", "ok"))
            .add_state(State::new("s1", "broken"))
            .add_action(Action::new("a0", "run", "s0"))
            .add_action(Action::new("a1", "repair", "s0"))
            .add_transition(Transition::new("t0", "a0", "s0", 0.9).reward(2.0))
            .add_transition(Transition::new("t1", "a0", "s1", 0.1))
            .add_transition(Transition::new("t2", "a1", "s0", 1.0).reward(-1.0))
            .set_initial("s0");
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
        assert!(builder.actions.is_empty());
        assert!(builder.transitions.is_empty());
        assert_eq!(builder.initial, None);
    }

    #[test]
    fn constructors_set_defaults() {
        let state = State::new("s0", "ok");
        assert_eq!(state.id, "s0");
        assert_eq!(state.label, "ok");

        let action = Action::new("a0", "run", "s0");
        assert_eq!(action.id, "a0");
        assert_eq!(action.label, "run");
        assert_eq!(action.source_state_id, "s0");

        let transition = Transition::new("t0", "a0", "s1", 0.5);
        assert_eq!(transition.id, "t0");
        assert_eq!(transition.action_id, "a0");
        assert_eq!(transition.target_state_id, "s1");
        assert_close(transition.probability, 0.5);
        assert_close(transition.reward, 0.0);
    }

    #[test]
    fn setters_change_one_field() {
        let transition = Transition::new("t0", "a0", "s1", 0.5).reward(-3.5);
        assert_close(transition.reward, -3.5);
        assert_close(transition.probability, 0.5);
    }

    #[test]
    fn builder_keeps_insertion_order() {
        let builder = example();
        assert_eq!(ids(&builder.states, |s| &s.id), ["s0", "s1"]);
        assert_eq!(ids(&builder.actions, |a| &a.id), ["a0", "a1"]);
        assert_eq!(ids(&builder.transitions, |t| &t.id), ["t0", "t1", "t2"]);
        assert_eq!(builder.initial.as_deref(), Some("s0"));
    }

    #[test]
    fn elements_may_be_added_in_any_order() {
        // transition before its action
        let mut builder = MdpBuilder::new();
        builder
            .add_transition(Transition::new("t0", "a0", "s0", 1.0))
            .add_action(Action::new("a0", "run", "s0"))
            .add_state(State::new("s0", "ok"));
        assert_eq!(builder.states.len(), 1);
        assert_eq!(builder.actions.len(), 1);
        assert_eq!(builder.transitions.len(), 1);
    }

    #[test]
    fn builder_can_be_filled_in_a_loop() {
        let mut builder = MdpBuilder::new();
        for i in 0..3 {
            builder.add_state(State::new(format!("s{i}"), "s"));
        }
        assert_eq!(ids(&builder.states, |s| &s.id), ["s0", "s1", "s2"]);
    }

    #[test]
    fn last_set_initial_wins() {
        let mut builder = example();
        builder.set_initial("s1");
        assert_eq!(builder.initial.as_deref(), Some("s1"));
    }

    #[test]
    fn same_target_with_different_rewards_is_kept_twice() {
        let mut builder = MdpBuilder::new();
        builder
            .add_transition(Transition::new("t0", "a0", "s1", 0.3).reward(5.0))
            .add_transition(Transition::new("t1", "a0", "s1", 0.2).reward(-1.0));
        assert_eq!(builder.transitions.len(), 2);
        assert_close(builder.transitions[0].reward, 5.0);
        assert_close(builder.transitions[1].reward, -1.0);
    }

    #[test]
    fn builder_stores_invalid_input_without_checking() {
        // Validation is the job of `build()` (task 1.2), not of `add_*`.
        let mut builder = MdpBuilder::new();
        builder
            .add_state(State::new("s0", "ok"))
            .add_state(State::new("s0", "duplicate id"))
            .add_action(Action::new("a0", "run", "missing"))
            .add_transition(Transition::new("t0", "a0", "s0", f64::NAN))
            .set_initial("missing");
        assert_eq!(builder.states.len(), 2);
        assert!(builder.transitions[0].probability.is_nan());
    }
}
