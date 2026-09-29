import type { MDPState, MDPAction, MDPTransition } from '../../types/mdp';
import type { MDPFileFormat, MDPVisualNode } from '../../types/fileFormat';

const FILE_EXTENSION = '.mdp.json';

// Minimal ambient types for the File System Access API (not yet in TypeScript's
// bundled DOM lib). Only the subset this file actually calls.
interface FileSystemWritableFileStream {
  write(data: BlobPart): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
}

export async function exportMDPToFile(
  states: MDPState[],
  actions: MDPAction[],
  transitions: MDPTransition[],
  nodesPosition: Record<string, { x: number; y: number }>,
  title: string,
  nodesSize: Record<string, { width: number; height: number }> = {},
  actionPositions: Record<string, { x: number; y: number }> = {}
): Promise<void> {
  const nodes: Record<string, MDPVisualNode> = {};
  for (const state of states) {
    const size = nodesSize[state.id];
    nodes[state.id] = {
      id: state.id,
      position: nodesPosition[state.id] ?? { x: 0, y: 0 },
      ...(size ? { size } : {}),
    };
  }
  for (const action of actions) {
    nodes[action.id] = {
      id: action.id,
      position: actionPositions[action.id] ?? { x: 0, y: 0 },
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

  const json = JSON.stringify(fileData, null, 2);
  const fileName = `${sanitizeFileName(title)}${FILE_EXTENSION}`;

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'MDP JSON file', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      throw error;
    }
  }

  // Fallback for browsers without the File System Access API (e.g. Firefox, Safari):
  // triggers a normal browser download instead of a folder/filename picker.
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
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
