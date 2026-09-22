import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Download, Upload, RotateCcw } from 'lucide-react';

interface ToolbarPanelProps {
  onSave: () => void;
  onOpen: (file: File) => void;
  onReset: () => void;
}

export function ToolbarPanel({ onSave, onOpen, onReset }: ToolbarPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onOpen(file);
    }
    event.target.value = '';
  };

  return (
    <div className="toolbar-panel">
      <button type="button" className="action-button" onClick={onSave}>
        <Download size={16} /> Save MDP (.mdp.json)
      </button>

      <button type="button" className="action-button secondary" onClick={handleOpenClick}>
        <Upload size={16} /> Open MDP
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden-file-input"
        onChange={handleFileChange}
      />

      <button type="button" className="action-button danger" onClick={onReset}>
        <RotateCcw size={16} /> Reset Canvas
      </button>
    </div>
  );
}
