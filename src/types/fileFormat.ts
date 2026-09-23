import type { MDPState, MDPAction, MDPTransition } from './mdp';

export interface MDPVisualNode {
  id: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface MDPFileFormat {
  version: '1.0';
  metadata: {
    title: string;
    description?: string;
    updatedAt: string;
  };

  logical: {
    states: MDPState[];
    actions: MDPAction[];
    transitions: MDPTransition[];
  };

  graphical: {
    viewport?: { x: number; y: number; zoom: number };
    nodes: Record<string, MDPVisualNode>;
  };
}
