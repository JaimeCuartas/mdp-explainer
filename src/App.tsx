import { useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import type { Node, Edge, OnNodesChange, OnEdgesChange } from '@xyflow/react';
import { Activity, Play } from 'lucide-react';
import { InlineMath, BlockMath } from 'react-katex';
import type { MDPState, MDPAction, MDPTransition } from './types/mdp';

const initialStates: MDPState[] = [
  { id: 's0', label: 'S0 (Start)', isInitial: true },
  { id: 's1', label: 'S1 (Cause)', isCandidateCause: true },
  { id: 's2', label: 'S2 (Target)', isTargetEffect: true },
];

const initialActions: MDPAction[] = [
  { id: 'a0', label: 'a_0', sourceStateId: 's0' },
  { id: 'a1', label: 'a_1', sourceStateId: 's1' },
];

const initialTransitions: MDPTransition[] = [
  { id: 't0', actionId: 'a0', targetStateId: 's1', probability: 0.8 },
  { id: 't1', actionId: 'a0', targetStateId: 's2', probability: 0.2 },
  { id: 't2', actionId: 'a1', targetStateId: 's2', probability: 1.0 },
];

function generateGraphElements(
  states: MDPState[],
  actions: MDPAction[],
  transitions: MDPTransition[]
) {
  const actionMap = new Map(actions.map((a) => [a.id, a]));

  const nodes: Node[] = states.map((state, index) => ({
    id: state.id,
    position: { x: 120 + index * 240, y: 150 },
    data: { label: state.label },
    style: {
      background: state.isCandidateCause
        ? '#dbeafe'
        : state.isTargetEffect
        ? '#fef3c7'
        : '#ffffff',
      border: '1px solid #94a3b8',
      borderRadius: '8px',
      padding: '10px',
    },
  }));

  const edges: Edge[] = transitions.map((t) => {
    const action = actionMap.get(t.actionId);
    const sourceStateId = action ? action.sourceStateId : '';
    const actionLabel = action ? action.label : t.actionId;

    return {
      id: `e-${t.id}`,
      source: sourceStateId,
      target: t.targetStateId,
      label: `${actionLabel} (p=${t.probability})`,
      animated: true,
    };
  });

  return { nodes, edges };
}

function App() {
  const [states] = useState<MDPState[]>(initialStates);
  const [actions] = useState<MDPAction[]>(initialActions);
  const [transitions] = useState<MDPTransition[]>(initialTransitions);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => generateGraphElements(states, actions, transitions),
    [states, actions, transitions]
  );

  const [nodes, , onNodesChange]: [Node[], unknown, OnNodesChange] =
    useNodesState(initialNodes);
  const [edges, , onEdgesChange]: [Edge[], unknown, OnEdgesChange] =
    useEdgesState(initialEdges);

  return (
    <div className="app-container">
      <div className="canvas-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <aside className="sidebar">
        <div className="sidebar-header">
          <Activity size={20} color="#2563eb" />
          <h2>MDP Explainer</h2>
        </div>

        <div className="metric-card">
          <h3>Causal Analysis (SPR)</h3>
          <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>
            Transition evaluation:
          </p>
          <BlockMath math="P(s' \mid s, a) = 0.8" />
        </div>

        <div className="metric-card">
          <h3>Candidate Cause <InlineMath math="c" /></h3>
          <p style={{ fontSize: '0.875rem' }}>
            State <InlineMath math="S_1" /> evaluated for causality.
          </p>
        </div>

        <button className="action-button">
          <Play size={16} /> Evaluate Causality
        </button>
      </aside>
    </div>
  );
}

export default App
