import type { MDPState, MDPAction, MDPTransition } from '../../types/mdp';
import { buildMDPGraph } from './mdpGraph';
import type { ValueIterationOptions, ValueIterationResult } from './types';

const DEFAULT_DISCOUNT_FACTOR = 0.9;
const DEFAULT_MAX_ITERATIONS = 1000;
const DEFAULT_TOLERANCE = 1e-6;

function expectedActionValue(
  action: MDPAction,
  transitionsByAction: Map<string, MDPTransition[]>,
  values: Record<string, number>,
  discountFactor: number
): number {
  const actionTransitions = transitionsByAction.get(action.id) ?? [];
  let expectedValue = 0;
  for (const transition of actionTransitions) {
    const reward = transition.reward ?? 0;
    expectedValue += transition.probability * (reward + discountFactor * values[transition.targetStateId]);
  }
  return expectedValue;
}

/**
 * Computes the optimal (reward-maximizing) policy via standard MDP value
 * iteration: V(s) = max_a sum_s' P(s'|s,a) * (R(s,a,s') + gamma * V(s')).
 * A state with no actions is treated as absorbing with value 0.
 */
export function computeOptimalPolicy(
  states: MDPState[],
  actions: MDPAction[],
  transitions: MDPTransition[],
  options: ValueIterationOptions = {}
): ValueIterationResult {
  const discountFactor = options.discountFactor ?? DEFAULT_DISCOUNT_FACTOR;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;

  const { actionsByState, transitionsByAction } = buildMDPGraph(states, actions, transitions);

  const values: Record<string, number> = {};
  for (const state of states) {
    values[state.id] = 0;
  }

  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations++) {
    const nextValues: Record<string, number> = {};

    for (const state of states) {
      const stateActions = actionsByState.get(state.id) ?? [];
      if (stateActions.length === 0) {
        nextValues[state.id] = 0;
        continue;
      }

      let bestValue = -Infinity;
      for (const action of stateActions) {
        const expectedValue = expectedActionValue(action, transitionsByAction, values, discountFactor);
        if (expectedValue > bestValue) {
          bestValue = expectedValue;
        }
      }
      nextValues[state.id] = bestValue;
    }

    let maxDelta = 0;
    for (const state of states) {
      maxDelta = Math.max(maxDelta, Math.abs(nextValues[state.id] - values[state.id]));
      values[state.id] = nextValues[state.id];
    }

    if (maxDelta < tolerance) {
      converged = true;
      iterations += 1;
      break;
    }
  }

  const policy: Record<string, string | null> = {};
  for (const state of states) {
    const stateActions = actionsByState.get(state.id) ?? [];
    let bestAction: MDPAction | null = null;
    let bestValue = -Infinity;
    for (const action of stateActions) {
      const expectedValue = expectedActionValue(action, transitionsByAction, values, discountFactor);
      if (expectedValue > bestValue) {
        bestValue = expectedValue;
        bestAction = action;
      }
    }
    policy[state.id] = bestAction ? bestAction.id : null;
  }

  return { values, policy, iterations, converged };
}
