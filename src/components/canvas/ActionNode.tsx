import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';

export interface ActionNodeData extends Record<string, unknown> {
  label: string;
}

export type ActionFlowNode = Node<ActionNodeData, 'action'>;

function ActionNodeComponent({ data, selected }: NodeProps<ActionFlowNode>) {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div className={`action-node${selected ? ' action-node--selected' : ''}`} title={data.label} />
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}

export const ActionNode = memo(ActionNodeComponent);
