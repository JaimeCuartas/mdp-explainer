import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { BaseEdge, EdgeLabelRenderer, useReactFlow } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import { InlineMath } from 'react-katex';

interface Point {
  x: number;
  y: number;
}

export interface TransitionEdgeData extends Record<string, unknown> {
  probability: number;
  reward: number;
  defaultCurveOffset: number;
  waypoints: Point[];
  onWaypointsChange: (waypoints: Point[]) => void;
}

export type TransitionFlowEdge = Edge<TransitionEdgeData, 'transition'>;

function getDefaultControlPoint(sourceX: number, sourceY: number, targetX: number, targetY: number, offset: number) {
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular to the source->target line, so the fan-out direction
  // stays correct no matter how the two nodes are positioned relative to each other.
  const perpX = -dy / length;
  const perpY = dx / length;
  return { x: midX + perpX * offset, y: midY + perpY * offset };
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export function TransitionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  selected,
  data,
}: EdgeProps<TransitionFlowEdge>) {
  const { screenToFlowPosition } = useReactFlow();
  // Live position while a handle is being dragged, before it's persisted on release.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragPoint, setDragPoint] = useState<Point | null>(null);

  const waypoints = data?.waypoints ?? [];
  const hasWaypoints = waypoints.length > 0;
  const onWaypointsChange = data?.onWaypointsChange ?? (() => {});

  const displayWaypoints = waypoints.map((waypoint, index) => (index === dragIndex ? (dragPoint ?? waypoint) : waypoint));

  let path: string;
  let labelPoint: Point;

  if (hasWaypoints) {
    const points = [{ x: sourceX, y: sourceY }, ...displayWaypoints, { x: targetX, y: targetY }];
    path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
    labelPoint = displayWaypoints[Math.floor((displayWaypoints.length - 1) / 2)];
  } else {
    const control = getDefaultControlPoint(sourceX, sourceY, targetX, targetY, data?.defaultCurveOffset ?? 0);
    path = `M${sourceX},${sourceY} Q${control.x},${control.y} ${targetX},${targetY}`;
    labelPoint = control;
  }

  const handlePointerDown = (index: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragIndex(index);
  };

  const handlePointerMove = (index: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
    if (event.buttons !== 1 || dragIndex !== index) {
      return;
    }
    const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setDragPoint({ x: flowPosition.x, y: flowPosition.y });
  };

  const handlePointerUp = (index: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragPoint) {
      onWaypointsChange(waypoints.map((waypoint, i) => (i === index ? dragPoint : waypoint)));
    }
    setDragIndex(null);
    setDragPoint(null);
  };

  const handleHandleDoubleClick = (index: number) => (event: ReactMouseEvent<SVGCircleElement>) => {
    event.stopPropagation();
    onWaypointsChange(waypoints.filter((_, i) => i !== index));
  };

  const handlePathDoubleClick = (event: ReactMouseEvent<SVGPathElement>) => {
    event.stopPropagation();
    if (!selected) {
      return;
    }
    const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const newWaypoint = { x: flowPosition.x, y: flowPosition.y };

    if (!hasWaypoints) {
      onWaypointsChange([newWaypoint]);
      return;
    }

    const points = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }];
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const distance = distanceToSegment(
        newWaypoint.x,
        newWaypoint.y,
        points[i].x,
        points[i].y,
        points[i + 1].x,
        points[i + 1].y
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    onWaypointsChange([...waypoints.slice(0, bestIndex), newWaypoint, ...waypoints.slice(bestIndex)]);
  };

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="nodrag nopan"
        style={{ cursor: selected ? 'crosshair' : undefined }}
        onDoubleClick={handlePathDoubleClick}
      />
      {selected &&
        displayWaypoints.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={6}
            className="nodrag nopan transition-edge-bend-handle"
            onPointerDown={handlePointerDown(index)}
            onPointerMove={handlePointerMove(index)}
            onPointerUp={handlePointerUp(index)}
            onDoubleClick={handleHandleDoubleClick(index)}
          />
        ))}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y}px)`,
            background: '#f9fafb',
            pointerEvents: 'none',
            fontSize: '0.7rem',
          }}
        >
          <InlineMath math={`${data?.probability ?? 0};${data?.reward ?? 0}`} />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
