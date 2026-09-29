import { useState } from 'react';
import { InlineMath } from 'react-katex';
import { computeOptimalPolicy } from '../../core/algorithms/valueIteration';
import type { ValueIterationResult } from '../../core/algorithms/types';
import type { MDPState, MDPAction, MDPTransition } from '../../types/mdp';
import { AccordionSection } from './AccordionSection';

interface PoliciesPanelProps {
  states: MDPState[];
  actions: MDPAction[];
  transitions: MDPTransition[];
  selectedStateId: string | null;
}

export function PoliciesPanel({ states, actions, transitions, selectedStateId }: PoliciesPanelProps) {
  const [gamma, setGamma] = useState(0.9);
  const [result, setResult] = useState<ValueIterationResult | null>(null);

  const handleCompute = () => {
    setResult(computeOptimalPolicy(states, actions, transitions, { discountFactor: gamma }));
  };

  const selectedState = states.find((state) => state.id === selectedStateId) ?? null;
  const bestActionId = selectedState && result ? result.policy[selectedState.id] : undefined;
  const bestAction = bestActionId ? actions.find((action) => action.id === bestActionId) : null;

  return (
    <AccordionSection label="Policies">
      <label className="inspector-field">
        <span>
          <InlineMath math="\gamma" />
        </span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={gamma}
          onChange={(event) => setGamma(Number(event.target.value))}
        />
      </label>

      <button type="button" className="action-button" onClick={handleCompute}>
        Compute Optimal Policy
      </button>

      {result &&
        (selectedState ? (
          bestAction ? (
            <p className="inspector-meta">
              <InlineMath math={`\\phi(${selectedState.label}) = ${bestAction.label}`} />
            </p>
          ) : (
            <p className="inspector-meta">No action is available from this state.</p>
          )
        ) : (
          <p className="inspector-meta">Select a state on the canvas to see its optimal action.</p>
        ))}
    </AccordionSection>
  );
}
