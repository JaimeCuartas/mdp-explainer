import { useCallback, useEffect, useMemo } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import type { Node, Edge, NodeMouseHandler, EdgeMouseHandler, OnNodeDrag, OnConnect, Connection } from '@xyflow/react';
import type { MDPState, MDPAction, MDPTransition } from '../../types/mdp';
import type { NodePosition } from '../../hooks/useMDP';

interface MDPFlowCanvasProps {
  states: MDPState[];
  actions: MDPAction[];
  transitions: MDPTransition[];
  nodePositions: Record<string, NodePosition>;
  selectedStateId: string | null;
  selectedTransitionId: string | null;
  onNodeDragStop: (stateId: string, position: NodePosition) => void;
  onSelectState: (stateId: string) => void;
  onSelectTransition: (transitionId: string) => void;
  onClearSelection: () => void;
  onAddState: (label: string, position: NodePosition) => void;
  onConnectStates: (sourceStateId: string, targetStateId: string) => void;
}

function buildNodes(
  states: MDPState[],
  nodePositions: Record<string, NodePosition>,
  selectedStateId: string | null
): Node[] {
  return states.map((state, index) => ({
    id: state.id,
    position: nodePositions[state.id] ?? { x: 120 + index * 220, y: 160 },
    data: { label: state.label },
    selected: state.id === selectedStateId,
    style: {
      background: state.isCandidateCause ? '#dbeafe' : state.isTargetEffect ? '#fef3c7' : '#ffffff',
      border: state.isInitial ? '2px solid #2563eb' : '1px solid #94a3b8',
      borderRadius: '8px',
      padding: '10px',
    },
  }));
}

function buildEdges(
  actions: MDPAction[],
  transitions: MDPTransition[],
  selectedTransitionId: string | null
): Edge[] {
  const actionMap = new Map(actions.map((action) => [action.id, action]));

  return transitions.map((transition) => {
    const action = actionMap.get(transition.actionId);
    return {
      id: transition.id,
      source: action ? action.sourceStateId : '',
      target: transition.targetStateId,
      label: `${action ? action.label : transition.actionId} (p=${transition.probability})`,
      animated: true,
      selected: transition.id === selectedTransitionId,
    };
  });
}

export function MDPFlowCanvas({
  states,
  actions,
  transitions,
  nodePositions,
  selectedStateId,
  selectedTransitionId,
  onNodeDragStop,
  onSelectState,
  onSelectTransition,
  onClearSelection,
  onAddState,
  onConnectStates,
}: MDPFlowCanvasProps) {
  const builtNodes = useMemo(
    () => buildNodes(states, nodePositions, selectedStateId),
    [states, nodePositions, selectedStateId]
  );
  const builtEdges = useMemo(
    () => buildEdges(actions, transitions, selectedTransitionId),
    [actions, transitions, selectedTransitionId]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  useEffect(() => setNodes(builtNodes), [builtNodes, setNodes]);
  useEffect(() => setEdges(builtEdges), [builtEdges, setEdges]);

  const handleNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      onNodeDragStop(node.id, node.position);
    },
    [onNodeDragStop]
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onSelectState(node.id);
    },
    [onSelectState]
  );

  const handleEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      onSelectTransition(edge.id);
    },
    [onSelectTransition]
  );

  const handlePaneClick = useCallback(() => {
    onClearSelection();
  }, [onClearSelection]);

  const handlePaneDoubleClick = useCallback(() => {
    const count = states.length;
    onAddState('New State', {
      x: 120 + (count % 5) * 200,
      y: 160 + Math.floor(count / 5) * 150,
    });
  }, [onAddState, states.length]);

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        onConnectStates(connection.source, connection.target);
      }
    },
    [onConnectStates]
  );

  return (
    <div className="canvas-wrapper" onDoubleClick={handlePaneDoubleClick}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onConnect={handleConnect}
        zoomOnDoubleClick={false}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
