#[derive(Debug, Clone)]
pub struct State {
    pub id: String,
    pub label: String,
    pub is_target_effect: bool,
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
            is_target_effect: false,
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
}

#[derive(Debug, Clone, Default)]
pub struct MdpBuilder {
    pub(crate) states: Vec<State>,
    pub(crate) actions: Vec<Action>,
    pub(crate) transitions: Vec<Transition>,
    pub(crate) initial: Option<String>,
}

impl MdpBuilder {
    pub fn new() -> Self {
        Self {
            states: Vec::new(),
            actions: Vec::new(),
            transitions: Vec::new(),
            initial: None,
        }
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

    pub fn set_initial(&mut self, initial: impl Into<String>) -> &mut Self {
        self.initial = Some(initial.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_mdp() {
        let mut mdp_builder = MdpBuilder::new();
    }
}
