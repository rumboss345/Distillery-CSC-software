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
  clampEquipmentProcessPosition,
  computeDefaultProcessPositions,
  computeProcessCanvasSize,
  computeStageBands,
} from './process-layout';
import { groupEquipmentByStage } from './process-stages';
import { EquipmentVisual } from './EquipmentVisual';
import { ProcessEquipmentDetailPanel } from './ProcessEquipmentDetailPanel';
import { processEquipmentVisualScale } from './process-visual-scale';
import type { EquipmentVisualData } from './equipment-visual.types';
import type { FloorEquipmentView } from '../../types';
import './process-view.css';

interface ProcessEquipmentCanvasProps {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  refreshKey: number;
  onLayoutChange?: () => void;
  onEditEquipment?: () => void;
  onRemoveEquipment?: () => void;
}

type EquipmentItem = FloorEquipmentView & { plan_name: string };

export function ProcessEquipmentCanvas({
  selectedId,
  onSelect,
  refreshKey,
  onLayoutChange,
  onEditEquipment,
  onRemoveEquipment,
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
  const stageBands = useMemo(() => computeStageBands(stages), [stages]);
  const defaultPositions = useMemo(
    () => computeDefaultProcessPositions(allEquipment),
    [allEquipment],
  );

  const canvasSize = useMemo(
    () => computeProcessCanvasSize(defaultPositions, stageBands),
    [defaultPositions, stageBands],
  );

  const clampToEquipmentStage = useCallback(
    (equipmentId: number, pos: { x: number; y: number }) =>
      clampEquipmentProcessPosition(equipmentId, pos, stages, stageBands, canvasSize.width),
    [stages, stageBands, canvasSize.width],
  );

  const summary = getProductionSummary();
  const offlineCount = allEquipment.filter((e) => e.status === 'offline').length;

  const selectedEquipment = selectedId != null
    ? allEquipment.find((e) => e.id === selectedId) ?? null
    : null;
  const selectedVisual = selectedId != null ? visualById.get(selectedId) ?? null : null;
  const selectedPlanName = selectedEquipment?.plan_name ?? '';

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
      const raw =
        item.process_pos_x != null && item.process_pos_y != null
          ? { x: item.process_pos_x, y: item.process_pos_y }
          : (defaultPositions.get(item.id) ?? { x: 40, y: 40 });
      return clampToEquipmentStage(item.id, raw);
    },
    [dragging, livePos, defaultPositions, clampToEquipmentStage],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMovePointer = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y) > 4) {
        dragMovedRef.current = true;
      }
      const pt = getCanvasPoint(e.clientX, e.clientY);
      const next = clampToEquipmentStage(dragging.id, {
        x: pt.x - dragging.offsetX,
        y: pt.y - dragging.offsetY,
      });
      livePosRef.current = next;
      setLivePos(next);
    };

    const onUp = () => {
      if (dragging) {
        if (!dragMovedRef.current) {
          onSelect(dragging.id);
        } else if (livePosRef.current) {
          const finalPos = clampToEquipmentStage(dragging.id, livePosRef.current);
          updateEquipmentProcessPosition(dragging.id, finalPos.x, finalPos.y);
          onLayoutChange?.();
        }
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
  }, [dragging, getCanvasPoint, clampToEquipmentStage, onLayoutChange, onSelect]);

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

  const autoArrangeSections = () => {
    for (const item of allEquipment) {
      const pos = defaultPositions.get(item.id);
      if (!pos) continue;
      updateEquipmentProcessPosition(item.id, pos.x, pos.y);
    }
    onLayoutChange?.();
  };

  return (
    <div className="process-view">
      <div className="process-toolbar">
        <span className="process-toolbar-title">Production flow</span>
        <span className="process-toolbar-hint">Drag within each equipment section · Pan background to scroll</span>
        <nav className="process-toolbar-links" aria-label="Production shortcuts">
          <Link to="/wash" className="process-toolbar-link">Wash</Link>
          <Link to="/distillation" className="process-toolbar-link">Distill</Link>
          <Link to="/blending" className="process-toolbar-link">Blend</Link>
          <Link to="/bottling" className="process-toolbar-link">Bottle</Link>
          <Link to="/barrels" className="process-toolbar-link">Barrels</Link>
        </nav>
        <div className="process-toolbar-actions">
          <button type="button" className="btn btn-sm btn-secondary" onClick={autoArrangeSections}>
            Auto-arrange
          </button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={zoomOut} aria-label="Zoom out">−</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={fitScreen}>Fit</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={zoomIn} aria-label="Zoom in">+</button>
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
            {stages.map(({ stage, items }, idx) => (
              <div
                key={stage.key}
                className={`process-stage-zone${idx % 2 === 0 ? ' process-stage-zone--alt' : ''}`}
                style={{
                  top: stageBands[idx]?.top ?? 0,
                  height: stageBands[idx]?.height ?? 260,
                  width: canvasSize.width - 16,
                }}
              >
                <div className="process-stage-header">
                  <span className="process-stage-label">{stage.label}</span>
                  <span className="process-stage-count">{items.length} unit{items.length === 1 ? '' : 's'}</span>
                  {assignmentsByStage[stage.key]?.length ? (
                    <span className="process-stage-assignees">
                      {assignmentsByStage[stage.key]
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
                  className={`process-equipment-node${isDragging ? ' process-equipment-node--dragging' : ''}${selectedId === item.id ? ' process-equipment-node--selected' : ''}${visual.isFermenting ? ' process-equipment-node--fermenting' : ''}`}
                  style={{ left: pos.x, top: pos.y }}
                  onPointerDown={(e) => onEquipmentPointerDown(e, item)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <EquipmentVisual
                    data={visual}
                    selected={selectedId === item.id}
                    labelStyle="process"
                    scaleMultiplier={processEquipmentVisualScale(item.equipment_type)}
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
          <section className="process-sidebar-section">
            <h4 className="process-sidebar-heading">Live summary</h4>
            <div className="process-stat-grid">
              <div className="process-stat">
                <span className="process-stat-value">{summary.activeMashes}</span>
                <span className="process-stat-label">Mashes</span>
              </div>
              <div className="process-stat">
                <span className="process-stat-value">{summary.activeRuns}</span>
                <span className="process-stat-label">Runs</span>
              </div>
              <div className="process-stat">
                <span className="process-stat-value">{summary.barrelsAging}</span>
                <span className="process-stat-label">Barrels</span>
              </div>
              <div className="process-stat">
                <span className="process-stat-value">{offlineCount}</span>
                <span className="process-stat-label">Offline</span>
              </div>
            </div>
          </section>

          <section className="process-sidebar-section process-sidebar-section--detail">
            <ProcessEquipmentDetailPanel
              equipment={selectedEquipment}
              visual={selectedVisual}
              planName={selectedPlanName}
              onEdit={onEditEquipment}
              onRemove={onRemoveEquipment}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
