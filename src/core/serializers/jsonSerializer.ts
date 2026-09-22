import type { MDPState, MDPAction, MDPTransition } from '../../types/mdp';
import type { MDPFileFormat, MDPVisualNode } from '../../types/fileFormat';

const FILE_EXTENSION = '.mdp.json';

export function exportMDPToFile(
  states: MDPState[],
  actions: MDPAction[],
  transitions: MDPTransition[],
  nodesPosition: Record<string, { x: number; y: number }>,
  title: string
): void {
  const nodes: Record<string, MDPVisualNode> = {};
  for (const state of states) {
    nodes[state.id] = {
      id: state.id,
      position: nodesPosition[state.id] ?? { x: 0, y: 0 },
    };
  }

  const fileData: MDPFileFormat = {
    version: '1.0',
    metadata: {
      title,
      updatedAt: new Date().toISOString(),
    },
    logical: { states, actions, transitions },
    graphical: { nodes },
  };

  const blob = new Blob([JSON.stringify(fileData, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFileName(title)}${FILE_EXTENSION}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importMDPFromFile(file: File): Promise<MDPFileFormat> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(reader.result as string);
        resolve(validateMDPFileFormat(parsed));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('The selected file is not valid JSON.'));
      }
    };

    reader.readAsText(file);
  });
}

function sanitizeFileName(title: string): string {
  const trimmed = title.trim();
  const base = trimmed.length > 0 ? trimmed : 'untitled';
  return base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function validateMDPFileFormat(data: unknown): MDPFileFormat {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid .mdp.json file: expected a JSON object.');
  }

  const candidate = data as Partial<MDPFileFormat>;

  if (candidate.version !== '1.0') {
    throw new Error('Invalid .mdp.json file: unsupported or missing "version".');
  }

  if (!candidate.metadata || typeof candidate.metadata.title !== 'string') {
    throw new Error('Invalid .mdp.json file: missing "metadata.title".');
  }

  const logical = candidate.logical;
  if (
    !logical ||
    !Array.isArray(logical.states) ||
    !Array.isArray(logical.actions) ||
    !Array.isArray(logical.transitions)
  ) {
    throw new Error('Invalid .mdp.json file: "logical" must contain states, actions, and transitions arrays.');
  }

  const graphical = candidate.graphical;
  if (!graphical || typeof graphical.nodes !== 'object' || graphical.nodes === null) {
    throw new Error('Invalid .mdp.json file: missing "graphical.nodes".');
  }

  return candidate as MDPFileFormat;
}
