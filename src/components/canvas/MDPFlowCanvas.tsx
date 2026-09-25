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
  MarkerType,
} from '@xyflow/react';
import type {
  Edge,
  NodeMouseHandler,
  EdgeMouseHandler,
  OnNodeDrag,
  OnConnect,
  OnConnectEnd,
  Connection,
  OnNodesDelete,
  OnEdgesDelete,
  IsValidConnection,
  NodeTypes,
} from '@xyflow/react';
import type { MDPState, MDPAction, MDPTransition } from '../../types/mdp';
import type { NodePosition, NodeSize } from '../../hooks/useMDP';
import { StateNode } from './StateNode';
import type { StateFlowNode } from './StateNode';
import { ActionNode } from './ActionNode';
import type { ActionFlowNode } from './ActionNode';

type FlowNode = StateFlowNode | ActionFlowNode;

const nodeTypes: NodeTypes = { state: StateNode, action: ActionNode };
const DEFAULT_NODE_SIZE: NodeSize = { width: 88, height: 88 };
const ACTION_NODE_SIZE: NodeSize = { width: 16, height: 16 };
const STRUCTURAL_EDGE_PREFIX = 'sa-';
const SELECTION_COLOR = '#2563eb';

interface MDPFlowCanvasProps {
  states: MDPState[];
  actions: MDPAction[];
  transitions: MDPTransition[];
  nodePositions: Record<string, NodePosition>;
  nodeSizes: Record<string, NodeSize>;
  actionPositions: Record<string, NodePosition>;
  selectedStateId: string | null;
  selectedActionId: string | null;
  selectedTransitionId: string | null;
  onNodeDragStop: (stateId: string, position: NodePosition) => void;
  onActionDragStop: (actionId: string, position: NodePosition) => void;
  onNodeResize: (stateId: string, size: NodeSize) => void;
  onSelectState: (stateId: string) => void;
  onSelectAction: (actionId: string) => void;
  onSelectTransition: (transitionId: string) => void;
  onClearSelection: () => void;
  onAddState: (label: string, position: NodePosition) => void;
  onConnectStateToAction: (stateId: string, actionId: string) => void;
  onConnectActionToState: (actionId: string, stateId: string) => void;
  onCreateActionFromState: (stateId: string, position: NodePosition) => void;
  onCreateStateFromAction: (actionId: string, position: NodePosition) => void;
  onDeleteState: (stateId: string) => void;
  onDeleteAction: (actionId: string) => void;
  onDeleteTransition: (transitionId: string) => void;
}

function buildStateNodes(
  states: MDPState[],
  nodePositions: Record<string, NodePosition>,
  nodeSizes: Record<string, NodeSize>,
  selectedStateId: string | null,
  onNodeResize: (stateId: string, size: NodeSize) => void
): StateFlowNode[] {
  return states.map((state, index) => {
    const size = nodeSizes[state.id] ?? DEFAULT_NODE_SIZE;
    return {
      id: state.id,
      type: 'state',
      position: nodePositions[state.id] ?? { x: 120 + index * 220, y: 160 },
      width: size.width,
      height: size.height,
      selected: state.id === selectedStateId,
      data: {
        label: state.label,
        isInitial: state.isInitial,
        isCandidateCause: state.isCandidateCause,
        isTargetEffect: state.isTargetEffect,
        onResizeEnd: (nextSize: NodeSize) => onNodeResize(state.id, nextSize),
      },
    };
  });
}

function buildActionNodes(
  actions: MDPAction[],
  actionPositions: Record<string, NodePosition>,
  nodePositions: Record<string, NodePosition>,
  selectedActionId: string | null
): ActionFlowNode[] {
  return actions.map((action, index) => {
    const sourcePosition = nodePositions[action.sourceStateId];
    const fallback = sourcePosition
      ? { x: sourcePosition.x + 40, y: sourcePosition.y + 120 }
      : { x: 160 + index * 140, y: 320 };

    return {
      id: action.id,
      type: 'action',
      position: actionPositions[action.id] ?? fallback,
      width: ACTION_NODE_SIZE.width,
      height: ACTION_NODE_SIZE.height,
      selected: action.id === selectedActionId,
      data: { label: action.label },
    };
  });
}

function buildEdges(
  actions: MDPAction[],
  transitions: MDPTransition[],
  selectedActionId: string | null,
  selectedTransitionId: string | null
): Edge[] {
  const stateToActionEdges: Edge[] = actions.map((action) => {
    const isSelected = action.id === selectedActionId;
    return {
      id: `${STRUCTURAL_EDGE_PREFIX}${action.id}`,
      source: action.sourceStateId,
      target: action.id,
      type: 'straight',
      selectable: false,
      deletable: false,
      selected: isSelected,
      label: action.label,
      labelBgStyle: { fill: '#f9fafb' },
      style: { stroke: isSelected ? SELECTION_COLOR : '#94a3b8', strokeWidth: isSelected ? 2 : 1 },
    };
  });

  const actionToStateEdges: Edge[] = transitions.map((transition) => {
    const isSelected = transition.id === selectedTransitionId;
    return {
      id: transition.id,
      source: transition.actionId,
      target: transition.targetStateId,
      label: `p=${transition.probability}`,
      animated: true,
      selected: isSelected,
      style: { stroke: isSelected ? SELECTION_COLOR : '#000000', strokeWidth: isSelected ? 2 : 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: isSelected ? SELECTION_COLOR : '#000000' },
      labelBgStyle: { fill: '#f9fafb' },
    };
  });

  return [...stateToActionEdges, ...actionToStateEdges];
}

const NEW_STATE_OFFSET: NodePosition = {
  x: -DEFAULT_NODE_SIZE.width / 2,
  y: -DEFAULT_NODE_SIZE.height / 2,
};

const NEW_ACTION_OFFSET: NodePosition = {
  x: -ACTION_NODE_SIZE.width / 2,
  y: -ACTION_NODE_SIZE.height / 2,
};

function getClientPoint(event: MouseEvent | TouchEvent): { clientX: number; clientY: number } {
  return 'changedTouches' in event ? event.changedTouches[0] : event;
}

function FlowCanvasInner({
  states,
  actions,
  transitions,
  nodePositions,
  nodeSizes,
  actionPositions,
  selectedStateId,
  selectedActionId,
  selectedTransitionId,
  onNodeDragStop,
  onActionDragStop,
  onNodeResize,
  onSelectState,
  onSelectAction,
  onSelectTransition,
  onClearSelection,
  onAddState,
  onConnectStateToAction,
  onConnectActionToState,
  onCreateActionFromState,
  onCreateStateFromAction,
  onDeleteState,
  onDeleteAction,
  onDeleteTransition,
}: MDPFlowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  const stateIds = useMemo(() => new Set(states.map((state) => state.id)), [states]);
  const actionIds = useMemo(() => new Set(actions.map((action) => action.id)), [actions]);

  const builtNodes = useMemo<FlowNode[]>(
    () => [
      ...buildStateNodes(states, nodePositions, nodeSizes, selectedStateId, onNodeResize),
      ...buildActionNodes(actions, actionPositions, nodePositions, selectedActionId),
    ],
    [states, nodePositions, nodeSizes, selectedStateId, onNodeResize, actions, actionPositions, selectedActionId]
  );
  const builtEdges = useMemo(
    () => buildEdges(actions, transitions, selectedActionId, selectedTransitionId),
    [actions, transitions, selectedActionId, selectedTransitionId]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  useEffect(() => setNodes(builtNodes), [builtNodes, setNodes]);
  useEffect(() => setEdges(builtEdges), [builtEdges, setEdges]);

  const handleNodeDragStop: OnNodeDrag<FlowNode> = useCallback(
    (_event, node) => {
      if (node.type === 'action') {
        onActionDragStop(node.id, node.position);
      } else {
        onNodeDragStop(node.id, node.position);
      }
    },
    [onNodeDragStop, onActionDragStop]
  );

  const handleNodeClick: NodeMouseHandler<FlowNode> = useCallback(
    (_event, node) => {
      if (node.type === 'action') {
        onSelectAction(node.id);
      } else {
        onSelectState(node.id);
      }
    },
    [onSelectState, onSelectAction]
  );

  const handleEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      if (edge.id.startsWith(STRUCTURAL_EDGE_PREFIX)) {
        onSelectAction(edge.id.slice(STRUCTURAL_EDGE_PREFIX.length));
        return;
      }
      onSelectTransition(edge.id);
    },
    [onSelectAction, onSelectTransition]
  );

  const handlePaneClick = useCallback(() => {
    onClearSelection();
  }, [onClearSelection]);

  const handlePaneDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest('.react-flow__node') || target.closest('.react-flow__edge')) {
        return;
      }

      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onAddState('New State', {
        x: flowPosition.x + NEW_STATE_OFFSET.x,
        y: flowPosition.y + NEW_STATE_OFFSET.y,
      });
    },
    [onAddState, screenToFlowPosition]
  );

  const isValidConnection: IsValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const { source, target } = connection;
      if (!source || !target || source === target) {
        return false;
      }
      const sourceIsState = stateIds.has(source);
      const sourceIsAction = actionIds.has(source);
      const targetIsState = stateIds.has(target);
      const targetIsAction = actionIds.has(target);
      return (sourceIsState && targetIsAction) || (sourceIsAction && targetIsState);
    },
    [stateIds, actionIds]
  );

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) {
        return;
      }
      if (stateIds.has(source) && actionIds.has(target)) {
        onConnectStateToAction(source, target);
      } else if (actionIds.has(source) && stateIds.has(target)) {
        onConnectActionToState(source, target);
      }
    },
    [stateIds, actionIds, onConnectStateToAction, onConnectActionToState]
  );

  const handleConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      if (connectionState.toNode || !connectionState.fromNode) {
        return;
      }

      const { clientX, clientY } = getClientPoint(event);
      const flowPosition = screenToFlowPosition({ x: clientX, y: clientY });
      const sourceNode = connectionState.fromNode;

      if (sourceNode.type === 'state') {
        onCreateActionFromState(sourceNode.id, {
          x: flowPosition.x + NEW_ACTION_OFFSET.x,
          y: flowPosition.y + NEW_ACTION_OFFSET.y,
        });
      } else if (sourceNode.type === 'action') {
        onCreateStateFromAction(sourceNode.id, {
          x: flowPosition.x + NEW_STATE_OFFSET.x,
          y: flowPosition.y + NEW_STATE_OFFSET.y,
        });
      }
    },
    [screenToFlowPosition, onCreateActionFromState, onCreateStateFromAction]
  );

  const handleNodesDelete: OnNodesDelete<FlowNode> = useCallback(
    (deletedNodes) => {
      for (const node of deletedNodes) {
        if (node.type === 'action') {
          onDeleteAction(node.id);
        } else {
          onDeleteState(node.id);
        }
      }
    },
    [onDeleteState, onDeleteAction]
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
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        isValidConnection={isValidConnection}
        onConnect={handleConnect}
        onConnectEnd={handleConnectEnd}
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
