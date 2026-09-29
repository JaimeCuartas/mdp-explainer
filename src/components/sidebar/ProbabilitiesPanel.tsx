import { useState } from 'react';
import { InlineMath } from 'react-katex';
import { computeReachabilityProbability } from '../../core/algorithms/reachability';
import type { ReachabilityResult } from '../../core/algorithms/types';
import type { MDPState, MDPAction, MDPTransition } from '../../types/mdp';
import { AccordionSection } from './AccordionSection';

interface ProbabilitiesPanelProps {
  states: MDPState[];
  actions: MDPAction[];
  transitions: MDPTransition[];
  selectedStateId: string | null;
}

export function ProbabilitiesPanel({ states, actions, transitions, selectedStateId }: ProbabilitiesPanelProps) {
  const [bestCaseResult, setBestCaseResult] = useState<ReachabilityResult | null>(null);
  const [worstCaseResult, setWorstCaseResult] = useState<ReachabilityResult | null>(null);

  const hasEffectStates = states.some((state) => state.isTargetEffect);
  const selectedState = states.find((state) => state.id === selectedStateId) ?? null;

  return (
    <AccordionSection label="Probabilities">
      {!hasEffectStates && (
        <p className="inspector-meta">Mark at least one state as "Target Effect" in its Inspector first.</p>
      )}

      <button
        type="button"
        className="action-button"
        onClick={() => setBestCaseResult(computeReachabilityProbability(states, actions, transitions, 'max'))}
      >
        Best-Case Reachability
      </button>

      <button
        type="button"
        className="action-button secondary"
        onClick={() => setWorstCaseResult(computeReachabilityProbability(states, actions, transitions, 'min'))}
      >
        Worst-Case Reachability
      </button>

      {selectedState ? (
        <>
          {bestCaseResult && (
            <p className="inspector-meta">
              <InlineMath
                math={`P_{max}(${selectedState.label}) = ${bestCaseResult.probabilities[selectedState.id].toFixed(3)}`}
              />
            </p>
          )}
          {worstCaseResult && (
            <p className="inspector-meta">
              <InlineMath
                math={`P_{min}(${selectedState.label}) = ${worstCaseResult.probabilities[selectedState.id].toFixed(3)}`}
              />
            </p>
          )}
        </>
      ) : (
        (bestCaseResult || worstCaseResult) && (
          <p className="inspector-meta">Select a state on the canvas to see its reachability probability.</p>
        )
      )}
    </AccordionSection>
  );
}
