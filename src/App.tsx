import { useCallback, useState } from 'react';
import { Activity } from 'lucide-react';
import { MDPFlowCanvas } from './components/canvas/MDPFlowCanvas';
import { ToolbarPanel } from './components/sidebar/ToolbarPanel';
import { InspectorPanel } from './components/sidebar/InspectorPanel';
import { useMDP } from './hooks/useMDP';
import { exportMDPToFile, importMDPFromFile } from './core/serializers/jsonSerializer';

function App() {
  const {
    title,
    states,
    actions,
    transitions,
    nodePositions,
    nodeSizes,
    actionPositions,
    setTitle,
    addState,
    updateState,
    removeState,
    addActionWithState,
    updateAction,
    removeAction,
    addTransition,
    addStateWithAction,
    updateTransition,
    removeTransition,
    updateNodePosition,
    updateNodeSize,
    updateActionPosition,
    loadMDPFromJSON,
    resetMDP,
  } = useMDP();

  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);

  const selectedState = states.find((state) => state.id === selectedStateId) ?? null;
  const selectedAction = actions.find((action) => action.id === selectedActionId) ?? null;
  const selectedTransition = transitions.find((transition) => transition.id === selectedTransitionId) ?? null;

  const handleSave = useCallback(() => {
    exportMDPToFile(states, actions, transitions, nodePositions, title, nodeSizes, actionPositions);
  }, [states, actions, transitions, nodePositions, title, nodeSizes, actionPositions]);

  const handleOpen = useCallback(
    async (file: File) => {
      try {
        const data = await importMDPFromFile(file);
        loadMDPFromJSON(data);
        setSelectedStateId(null);
        setSelectedActionId(null);
        setSelectedTransitionId(null);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Failed to open the MDP file.');
      }
    },
    [loadMDPFromJSON]
  );

  const handleReset = useCallback(() => {
    resetMDP();
    setSelectedStateId(null);
    setSelectedActionId(null);
    setSelectedTransitionId(null);
  }, [resetMDP]);

  const handleSelectState = useCallback((stateId: string) => {
    setSelectedStateId(stateId);
    setSelectedActionId(null);
    setSelectedTransitionId(null);
  }, []);

  const handleSelectAction = useCallback((actionId: string) => {
    setSelectedActionId(actionId);
    setSelectedStateId(null);
    setSelectedTransitionId(null);
  }, []);

  const handleSelectTransition = useCallback((transitionId: string) => {
    setSelectedTransitionId(transitionId);
    setSelectedStateId(null);
    setSelectedActionId(null);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedStateId(null);
    setSelectedActionId(null);
    setSelectedTransitionId(null);
  }, []);

  const handleDeleteState = useCallback(
    (stateId: string) => {
      removeState(stateId);
      setSelectedStateId(null);
    },
    [removeState]
  );

  const handleDeleteAction = useCallback(
    (actionId: string) => {
      removeAction(actionId);
      setSelectedActionId(null);
    },
    [removeAction]
  );

  const handleDeleteTransition = useCallback(
    (transitionId: string) => {
      removeTransition(transitionId);
      setSelectedTransitionId(null);
    },
    [removeTransition]
  );

  const handleConnectStateToAction = useCallback(
    (stateId: string, actionId: string) => {
      updateAction(actionId, { sourceStateId: stateId });
    },
    [updateAction]
  );

  const handleConnectActionToState = useCallback(
    (actionId: string, stateId: string) => {
      addTransition(actionId, stateId, 1);
    },
    [addTransition]
  );

  return (
    <div className="app-container">
      <MDPFlowCanvas
        states={states}
        actions={actions}
        transitions={transitions}
        nodePositions={nodePositions}
        nodeSizes={nodeSizes}
        actionPositions={actionPositions}
        selectedStateId={selectedStateId}
        selectedActionId={selectedActionId}
        selectedTransitionId={selectedTransitionId}
        onNodeDragStop={updateNodePosition}
        onActionDragStop={updateActionPosition}
        onNodeResize={updateNodeSize}
        onSelectState={handleSelectState}
        onSelectAction={handleSelectAction}
        onSelectTransition={handleSelectTransition}
        onClearSelection={handleClearSelection}
        onAddState={addState}
        onConnectStateToAction={handleConnectStateToAction}
        onConnectActionToState={handleConnectActionToState}
        onCreateActionFromState={addActionWithState}
        onCreateStateFromAction={addStateWithAction}
        onDeleteState={handleDeleteState}
        onDeleteAction={handleDeleteAction}
        onDeleteTransition={handleDeleteTransition}
      />

      <aside className="sidebar">
        <div className="sidebar-header">
          <Activity size={20} color="#2563eb" />
          <input
            type="text"
            className="mdp-title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="MDP title"
          />
        </div>

        <ToolbarPanel onSave={handleSave} onOpen={handleOpen} onReset={handleReset} />

        <InspectorPanel
          selectedState={selectedState}
          selectedAction={selectedAction}
          selectedTransition={selectedTransition}
          actions={actions}
          states={states}
          onUpdateState={updateState}
          onUpdateAction={updateAction}
          onUpdateTransition={updateTransition}
          onDeleteState={handleDeleteState}
          onDeleteAction={handleDeleteAction}
        />
      </aside>
    </div>
  );
}

export default App;
