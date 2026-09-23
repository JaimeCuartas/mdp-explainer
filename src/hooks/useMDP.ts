import { useCallback, useState } from 'react';
import type { MDPState, MDPAction, MDPTransition } from '../types/mdp';
import type { MDPFileFormat } from '../types/fileFormat';

export interface NodePosition {
  x: number;
  y: number;
}

const DEFAULT_TITLE = 'Untitled MDP';

function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useMDP() {
  const [title, setTitle] = useState<string>(DEFAULT_TITLE);
  const [states, setStates] = useState<MDPState[]>([]);
  const [actions, setActions] = useState<MDPAction[]>([]);
  const [transitions, setTransitions] = useState<MDPTransition[]>([]);
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});

  const addState = useCallback((label: string, position: NodePosition): string => {
    const id = generateId('s');
    setStates((prev) => [...prev, { id, label }]);
    setNodePositions((prev) => ({ ...prev, [id]: position }));
    return id;
  }, []);

  const updateState = useCallback((id: string, updates: Partial<MDPState>): void => {
    setStates((prev) => prev.map((state) => (state.id === id ? { ...state, ...updates } : state)));
  }, []);

  const removeState = useCallback((id: string): void => {
    setStates((prev) => prev.filter((state) => state.id !== id));
    setActions((prevActions) => {
      const remainingActions = prevActions.filter((action) => action.sourceStateId !== id);
      const removedActionIds = new Set(
        prevActions.filter((action) => action.sourceStateId === id).map((action) => action.id)
      );
      setTransitions((prevTransitions) =>
        prevTransitions.filter(
          (transition) => transition.targetStateId !== id && !removedActionIds.has(transition.actionId)
        )
      );
      return remainingActions;
    });
    setNodePositions((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([positionId]) => positionId !== id))
    );
  }, []);

  const addAction = useCallback((label: string, sourceStateId: string): string => {
    const id = generateId('a');
    setActions((prev) => [...prev, { id, label, sourceStateId }]);
    return id;
  }, []);

  const updateAction = useCallback((id: string, updates: Partial<MDPAction>): void => {
    setActions((prev) => prev.map((action) => (action.id === id ? { ...action, ...updates } : action)));
  }, []);

  const addTransition = useCallback(
    (actionId: string, targetStateId: string, probability: number): string => {
      const id = generateId('t');
      setTransitions((prev) => [...prev, { id, actionId, targetStateId, probability }]);
      return id;
    },
    []
  );

  const updateTransition = useCallback((id: string, updates: Partial<MDPTransition>): void => {
    setTransitions((prev) =>
      prev.map((transition) => (transition.id === id ? { ...transition, ...updates } : transition))
    );
  }, []);

  const removeTransition = useCallback((id: string): void => {
    setTransitions((prev) => prev.filter((transition) => transition.id !== id));
  }, []);

  const updateNodePosition = useCallback((stateId: string, position: NodePosition): void => {
    setNodePositions((prev) => ({ ...prev, [stateId]: position }));
  }, []);

  const loadMDPFromJSON = useCallback((data: MDPFileFormat): void => {
    setTitle(data.metadata.title);
    setStates(data.logical.states);
    setActions(data.logical.actions);
    setTransitions(data.logical.transitions);

    const positions: Record<string, NodePosition> = {};
    for (const node of Object.values(data.graphical.nodes)) {
      positions[node.id] = node.position;
    }
    setNodePositions(positions);
  }, []);

  const resetMDP = useCallback((): void => {
    setTitle(DEFAULT_TITLE);
    setStates([]);
    setActions([]);
    setTransitions([]);
    setNodePositions({});
  }, []);

  return {
    title,
    states,
    actions,
    transitions,
    nodePositions,
    setTitle,
    addState,
    updateState,
    removeState,
    addAction,
    updateAction,
    addTransition,
    updateTransition,
    removeTransition,
    updateNodePosition,
    loadMDPFromJSON,
    resetMDP,
  };
}
