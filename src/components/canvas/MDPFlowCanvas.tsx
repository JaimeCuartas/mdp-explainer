import { useCallback, useEffect, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react';
import type {
  Node,
  Edge,
  NodeMouseHandler,
  EdgeMouseHandler,
  OnNodeDrag,
  OnConnect,
  Connection,
  OnNodesDelete,
  OnEdgesDelete,
} from '@xyflow/react';
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
  onDeleteState: (stateId: string) => void;
  onDeleteTransition: (transitionId: string) => void;
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

const NEW_STATE_OFFSET: NodePosition = { x: -70, y: -20 };

function FlowCanvasInner({
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
  onDeleteState,
  onDeleteTransition,
}: MDPFlowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

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

  const handlePaneDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onAddState('New State', {
        x: flowPosition.x + NEW_STATE_OFFSET.x,
        y: flowPosition.y + NEW_STATE_OFFSET.y,
      });
    },
    [onAddState, screenToFlowPosition]
  );

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        onConnectStates(connection.source, connection.target);
      }
    },
    [onConnectStates]
  );

  const handleNodesDelete: OnNodesDelete = useCallback(
    (deletedNodes) => {
      for (const node of deletedNodes) {
        onDeleteState(node.id);
      }
    },
    [onDeleteState]
  );

  const handleEdgesDelete: OnEdgesDelete = useCallback(
    (deletedEdges) => {
      for (const edge of deletedEdges) {
        onDeleteTransition(edge.id);
      }
    },
    [onDeleteTransition]
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
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        zoomOnDoubleClick={false}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function MDPFlowCanvas(props: MDPFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
