import type { MDPState, MDPAction, MDPTransition } from '../../types/mdp';

export interface MDPGraph {
  states: MDPState[];
  actionsByState: Map<string, MDPAction[]>;
  transitionsByAction: Map<string, MDPTransition[]>;
}

export function buildMDPGraph(states: MDPState[], actions: MDPAction[], transitions: MDPTransition[]): MDPGraph {
  const actionsByState = new Map<string, MDPAction[]>();
  for (const action of actions) {
    const list = actionsByState.get(action.sourceStateId);
    if (list) {
      list.push(action);
    } else {
      actionsByState.set(action.sourceStateId, [action]);
    }
  }

  const transitionsByAction = new Map<string, MDPTransition[]>();
  for (const transition of transitions) {
    const list = transitionsByAction.get(transition.actionId);
    if (list) {
      list.push(transition);
    } else {
      transitionsByAction.set(transition.actionId, [transition]);
    }
  }

  return { states, actionsByState, transitionsByAction };
}
