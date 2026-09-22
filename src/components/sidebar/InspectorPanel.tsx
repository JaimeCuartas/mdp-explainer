import type { ChangeEvent } from 'react';
import type { MDPState, MDPAction, MDPTransition } from '../../types/mdp';

interface InspectorPanelProps {
  selectedState: MDPState | null;
  selectedTransition: MDPTransition | null;
  actions: MDPAction[];
  states: MDPState[];
  onUpdateState: (id: string, updates: Partial<MDPState>) => void;
  onUpdateTransition: (id: string, updates: Partial<MDPTransition>) => void;
}

export function InspectorPanel({
  selectedState,
  selectedTransition,
  actions,
  states,
  onUpdateState,
  onUpdateTransition,
}: InspectorPanelProps) {
  if (selectedState) {
    const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => {
      onUpdateState(selectedState.id, { label: event.target.value });
    };

    return (
      <div className="inspector-panel">
        <h3>State Inspector</h3>

        <label className="inspector-field">
          <span>Label</span>
          <input type="text" value={selectedState.label} onChange={handleLabelChange} />
        </label>

        <label className="inspector-checkbox">
          <input
            type="checkbox"
            checked={!!selectedState.isInitial}
            onChange={(event) => onUpdateState(selectedState.id, { isInitial: event.target.checked })}
          />
          <span>Initial State</span>
        </label>

        <label className="inspector-checkbox">
          <input
            type="checkbox"
            checked={!!selectedState.isCandidateCause}
            onChange={(event) => onUpdateState(selectedState.id, { isCandidateCause: event.target.checked })}
          />
          <span>Candidate Cause</span>
        </label>

        <label className="inspector-checkbox">
          <input
            type="checkbox"
            checked={!!selectedState.isTargetEffect}
            onChange={(event) => onUpdateState(selectedState.id, { isTargetEffect: event.target.checked })}
          />
          <span>Target Effect</span>
        </label>
      </div>
    );
  }

  if (selectedTransition) {
    const action = actions.find((a) => a.id === selectedTransition.actionId);
    const targetState = states.find((s) => s.id === selectedTransition.targetStateId);

    const handleProbabilityChange = (event: ChangeEvent<HTMLInputElement>) => {
      onUpdateTransition(selectedTransition.id, { probability: Number(event.target.value) });
    };

    return (
      <div className="inspector-panel">
        <h3>Transition Inspector</h3>

        <p className="inspector-meta">
          {action ? action.label : selectedTransition.actionId} &rarr;{' '}
          {targetState ? targetState.label : selectedTransition.targetStateId}
        </p>

        <label className="inspector-field">
          <span>Probability</span>
          <input type="number" min={0} max={1} step={0.01} value={selectedTransition.probability} onChange={handleProbabilityChange} />
        </label>
      </div>
    );
  }

  return (
    <div className="inspector-panel inspector-empty">
      <p>Select a state or transition on the canvas to inspect its properties.</p>
    </div>
  );
}
