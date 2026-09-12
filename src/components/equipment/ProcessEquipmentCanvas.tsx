import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProcessAssignments, type ProcessAssignmentEntry } from '../../lib/auth-api';
import {
  getAllFloorEquipmentWithContext,
  getEquipmentVolumeReport,
  getFloorPlans,
  getProductionSummary,
  updateEquipmentProcessPosition,
} from '../../db/queries';
import { buildEquipmentVisualData } from './equipment-visual-shared';
import {
  computeDefaultProcessPositions,
  computeProcessCanvasSize,
  getStageZoneTop,
  PROCESS_STAGE_HEIGHT,
} from './process-layout';
import { groupEquipmentByStage } from './process-stages';
import { EquipmentVisual } from './EquipmentVisual';
import { TankLevelsPanel } from './TankLevelsPanel';
import type { EquipmentVisualData } from './equipment-visual.types';
import type { FloorEquipmentView } from '../../types';
import './process-view.css';

interface ProcessEquipmentCanvasProps {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  refreshKey: number;
  onLayoutChange?: () => void;
}

type EquipmentItem = FloorEquipmentView & { plan_name: string };

export function ProcessEquipmentCanvas({
  selectedId,
  onSelect,
  refreshKey,
  onLayoutChange,
}: ProcessEquipmentCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const [dragging, setDragging] = useState<{ id: number; offsetX: number; offsetY: number } | null>(null);
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);
  const livePosRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [assignmentsByStage, setAssignmentsByStage] = useState<
    Record<string, ProcessAssignmentEntry[]>
  >({});

  useEffect(() => {
    fetchProcessAssignments()
      .then(({ assignments }) => setAssignmentsByStage(assignments))
      .catch(() => setAssignmentsByStage({}));
  }, [refreshKey]);

  const plans = getFloorPlans();
  const volumeById = useMemo(() => {
    const map = new Map<number, ReturnType<typeof getEquipmentVolumeReport>[0]>();
    for (const row of getEquipmentVolumeReport()) map.set(row.id, row);
    return map;
  }, [refreshKey]);

  const allEquipment = useMemo((): EquipmentItem[] => {
    const planNameById = new Map(plans.map((p) => [p.id, p.name]));
    return getAllFloorEquipmentWithContext().map((eq) => ({
      ...eq,
      plan_name: planNameById.get(eq.floor_plan_id) ?? '',
    }));
  }, [refreshKey, plans]);

  const visualById = useMemo(() => {
    const map = new Map<number, EquipmentVisualData>();
    for (const eq of allEquipment) {
      map.set(eq.id, buildEquipmentVisualData(eq, volumeById.get(eq.id), eq.plan_name));
    }
    return map;
  }, [allEquipment, volumeById]);

  const stages = useMemo(() => groupEquipmentByStage(allEquipment), [allEquipment]);
  const defaultPositions = useMemo(
    () => computeDefaultProcessPositions(allEquipment),
    [allEquipment],
  );

  const canvasSize = useMemo(
    () => computeProcessCanvasSize(defaultPositions, stages.length),
    [defaultPositions, stages.length],
  );

  const tanks = useMemo(
    () => [...visualById.values()].filter((v) => v.equipmentType === 'holding_tank'),
    [visualById],
  );

  const summary = getProductionSummary();
  const offlineCount = allEquipment.filter((e) => e.status === 'offline').length;

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return { x: 0, y: 0 };
      const rect = viewport.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / scale,
        y: (clientY - rect.top - pan.y) / scale,
      };
    },
    [pan.x, pan.y, scale],
  );

  const resolvePosition = useCallback(
    (item: EquipmentItem) => {
      if (dragging?.id === item.id && livePos) return livePos;
      if (item.process_pos_x != null && item.process_pos_y != null) {
        return { x: item.process_pos_x, y: item.process_pos_y };
      }
      return defaultPositions.get(item.id) ?? { x: 40, y: 40 };
    },
    [dragging, livePos, defaultPositions],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMovePointer = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y) > 4) {
        dragMovedRef.current = true;
      }
      const pt = getCanvasPoint(e.clientX, e.clientY);
      const next = {
        x: pt.x - dragging.offsetX,
        y: pt.y - dragging.offsetY,
      };
      livePosRef.current = next;
      setLivePos(next);
    };

    const onUp = () => {
      if (livePosRef.current && dragging) {
        updateEquipmentProcessPosition(
          dragging.id,
          Math.round(livePosRef.current.x),
          Math.round(livePosRef.current.y),
        );
        onLayoutChange?.();
      }
      livePosRef.current = null;
      setDragging(null);
      setLivePos(null);
    };

    window.addEventListener('pointermove', onMovePointer);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMovePointer);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, getCanvasPoint, onLayoutChange]);

  const onViewportPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.process-equipment-node')) return;
    setPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onViewportPointerMove = (e: React.PointerEvent) => {
    if (!panning || dragging) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  };

  const onViewportPointerUp = () => setPanning(false);

  const onEquipmentPointerDown = (e: React.PointerEvent, item: EquipmentItem) => {
    e.stopPropagation();
    e.preventDefault();
    dragMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    const pos = resolvePosition(item);
    const pt = getCanvasPoint(e.clientX, e.clientY);
    setDragging({
      id: item.id,
      offsetX: pt.x - pos.x,
      offsetY: pt.y - pos.y,
    });
  };

  const fitScreen = () => { setScale(1); setPan({ x: 0, y: 0 }); };
  const zoomIn = () => setScale((s) => Math.min(1.8, s * 1.12));
  const zoomOut = () => setScale((s) => Math.max(0.45, s / 1.12));

  return (
    <div className="process-view">
      <div className="process-toolbar">
        <span className="process-toolbar-title">Production</span>
        <span className="process-toolbar-hint">Drag equipment to arrange · Pan empty space to move canvas</span>
        <div className="process-toolbar-actions">
          <button type="button" className="btn btn-sm btn-secondary" onClick={zoomOut}>−</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={fitScreen}>Fit</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={zoomIn}>+</button>
        </div>
      </div>

      <div className="process-body">
        <div
          ref={viewportRef}
          className={`process-viewport${panning ? ' process-viewport--panning' : ''}${dragging ? ' process-viewport--dragging' : ''}`}
          onPointerDown={onViewportPointerDown}
          onPointerMove={onViewportPointerMove}
          onPointerUp={onViewportPointerUp}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('.process-equipment-node')) return;
            onSelect(null);
          }}
        >
          <div
            className="process-canvas"
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            }}
          >
            {stages.map(({ stage }, idx) => (
              <div
                key={stage.key}
                className="process-stage-zone"
                style={{
                  top: getStageZoneTop(idx),
                  height: PROCESS_STAGE_HEIGHT,
                  width: canvasSize.width - 16,
                }}
              >
                <div className="process-stage-header">
                  <span className="process-stage-label">{stage.label}</span>
                  {assignmentsByStage[stage.key]?.length ? (
                    <span className="process-stage-assignees">
                      — {assignmentsByStage[stage.key]
                        .map((a) => a.name || a.email)
                        .join(', ')}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}

            {allEquipment.map((item) => {
              const visual = visualById.get(item.id)!;
              const pos = resolvePosition(item);
              const isDragging = dragging?.id === item.id;

              return (
                <div
                  key={item.id}
                  className={`process-equipment-node${isDragging ? ' process-equipment-node--dragging' : ''}${selectedId === item.id ? ' process-equipment-node--selected' : ''}`}
                  style={{ left: pos.x, top: pos.y }}
                  onPointerDown={(e) => onEquipmentPointerDown(e, item)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <EquipmentVisual
                    data={visual}
                    selected={selectedId === item.id}
                    labelStyle="process"
                    onClick={() => {
                      if (!dragMovedRef.current) onSelect(item.id);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <aside className="process-sidebar">
          <div className="process-panel card process-panel--status">
            <h4 className="process-panel-title">System Status</h4>
            <dl className="process-status-list">
              <dt>Active mashes</dt><dd>{summary.activeMashes}</dd>
              <dt>Active runs</dt><dd>{summary.activeRuns}</dd>
              <dt>Barrels aging</dt><dd>{summary.barrelsAging}</dd>
              <dt>Equipment offline</dt><dd>{offlineCount}</dd>
            </dl>
          </div>

          <TankLevelsPanel
            tanks={tanks}
            selectedId={selectedId}
            onSelect={onSelect}
          />

          <div className="process-panel card">
            <h4 className="process-panel-title">Quick Actions</h4>
            <div className="process-quick-actions">
              <Link to="/wash" className="btn btn-sm btn-secondary">Wash Batch</Link>
              <Link to="/distillation" className="btn btn-sm btn-secondary">Distillation</Link>
              <Link to="/distillation" className="btn btn-sm btn-secondary">Record Transfer</Link>
              <Link to="/inventory" className="btn btn-sm btn-secondary">Inventory</Link>
              <Link to="/bottling" className="btn btn-sm btn-secondary">Bottling</Link>
              <Link to="/barrels" className="btn btn-sm btn-secondary">Barrel Aging</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
