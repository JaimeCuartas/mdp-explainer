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
  } = useMDP();

  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);

  const selectedState = states.find((state) => state.id === selectedStateId) ?? null;
  const selectedTransition = transitions.find((transition) => transition.id === selectedTransitionId) ?? null;

  const handleSave = useCallback(() => {
    exportMDPToFile(states, actions, transitions, nodePositions, title);
  }, [states, actions, transitions, nodePositions, title]);

  const handleOpen = useCallback(
    async (file: File) => {
      try {
        const data = await importMDPFromFile(file);
        loadMDPFromJSON(data);
        setSelectedStateId(null);
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
    setSelectedTransitionId(null);
  }, [resetMDP]);

  const handleSelectState = useCallback((stateId: string) => {
    setSelectedStateId(stateId);
    setSelectedTransitionId(null);
  }, []);

  const handleSelectTransition = useCallback((transitionId: string) => {
    setSelectedTransitionId(transitionId);
    setSelectedStateId(null);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedStateId(null);
    setSelectedTransitionId(null);
  }, []);

  const handleDeleteState = useCallback(
    (stateId: string) => {
      removeState(stateId);
      setSelectedStateId(null);
    },
    [removeState]
  );

  const handleDeleteTransition = useCallback(
    (transitionId: string) => {
      removeTransition(transitionId);
      setSelectedTransitionId(null);
    },
    [removeTransition]
  );

  const handleConnectStates = useCallback(
    (sourceStateId: string, targetStateId: string) => {
      const actionId = addAction(`a_${actions.length}`, sourceStateId);
      addTransition(actionId, targetStateId, 1);
    },
    [actions.length, addAction, addTransition]
  );

  return (
    <div className="app-container">
      <MDPFlowCanvas
        states={states}
        actions={actions}
        transitions={transitions}
        nodePositions={nodePositions}
        selectedStateId={selectedStateId}
        selectedTransitionId={selectedTransitionId}
        onNodeDragStop={updateNodePosition}
        onSelectState={handleSelectState}
        onSelectTransition={handleSelectTransition}
        onClearSelection={handleClearSelection}
        onAddState={addState}
        onConnectStates={handleConnectStates}
        onDeleteState={handleDeleteState}
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
          selectedTransition={selectedTransition}
          actions={actions}
          states={states}
          onUpdateState={updateState}
          onUpdateAction={updateAction}
          onUpdateTransition={updateTransition}
          onDeleteState={handleDeleteState}
        />
      </aside>
    </div>
  );
}

export default App;
