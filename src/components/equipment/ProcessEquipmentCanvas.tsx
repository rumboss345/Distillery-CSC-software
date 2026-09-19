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
  computeFitToViewportTransform,
  computeMaxColumnsForViewport,
  computeProcessLayoutPlan,
  resolveDropSlotPosition,
} from './process-layout';
import { EquipmentVisual } from './EquipmentVisual';
import { ProcessEquipmentDetailPanel } from './ProcessEquipmentDetailPanel';
import { processEquipmentVisualScale } from './process-visual-scale';
import type { EquipmentVisualData } from './equipment-visual.types';
import type { FloorEquipmentView } from '../../types';
import {
  equipmentBlocksProduction,
  equipmentHasMaintenanceTag,
  equipmentShowsRepairNoteIndicator,
} from '../../lib/equipment-maintenance';
import { ProcessEquipmentMaintenancePopover } from './ProcessEquipmentMaintenancePopover';
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
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 520 });
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
  const [maintenancePopover, setMaintenancePopover] = useState<{
    equipmentId: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setViewportSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  const maxColumns = useMemo(
    () => computeMaxColumnsForViewport(viewportSize.width),
    [viewportSize.width],
  );

  const layoutPlan = useMemo(
    () => computeProcessLayoutPlan(allEquipment, maxColumns),
    [allEquipment, maxColumns],
  );

  const { stages, stageBands, canvasSize, positions: layoutPositions } = layoutPlan;

  const applyFitToViewport = useCallback(() => {
    const fit = computeFitToViewportTransform(canvasSize, viewportSize);
    setScale(fit.scale);
    setPan(fit.pan);
  }, [canvasSize, viewportSize]);

  useEffect(() => {
    applyFitToViewport();
  }, [applyFitToViewport, refreshKey]);

  const summary = getProductionSummary();
  const offlineCount = allEquipment.filter(
    (e) => e.status === 'offline' || equipmentBlocksProduction(e),
  ).length;

  const selectedEquipment = selectedId != null
    ? allEquipment.find((e) => e.id === selectedId) ?? null
    : null;
  const selectedVisual = selectedId != null ? visualById.get(selectedId) ?? null : null;
  const selectedPlanName = selectedEquipment?.plan_name ?? '';
  const maintenancePopoverEquipment = maintenancePopover
    ? allEquipment.find((e) => e.id === maintenancePopover.equipmentId) ?? null
    : null;

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
      return layoutPositions.get(item.id) ?? { x: 40, y: 40 };
    },
    [dragging, livePos, layoutPositions],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMovePointer = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y) > 4) {
        dragMovedRef.current = true;
      }
      const pt = getCanvasPoint(e.clientX, e.clientY);
      const next = resolveDropSlotPosition(
        dragging.id,
        {
          x: pt.x - dragging.offsetX,
          y: pt.y - dragging.offsetY,
        },
        layoutPlan,
      );
      livePosRef.current = next;
      setLivePos(next);
    };

    const onUp = () => {
      if (dragging) {
        if (!dragMovedRef.current) {
          onSelect(dragging.id);
        } else if (livePosRef.current) {
          const finalPos = resolveDropSlotPosition(dragging.id, livePosRef.current, layoutPlan);
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
  }, [dragging, getCanvasPoint, layoutPlan, onLayoutChange, onSelect]);

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

  useEffect(() => {
    if (!maintenancePopover) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMaintenancePopover(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maintenancePopover]);

  const onEquipmentContextMenu = (e: React.MouseEvent, item: EquipmentItem) => {
    if (!equipmentHasMaintenanceTag(item)) return;
    e.preventDefault();
    e.stopPropagation();
    setMaintenancePopover({ equipmentId: item.id, x: e.clientX, y: e.clientY });
    onSelect(item.id);
  };

  const onEquipmentPointerDown = (e: React.PointerEvent, item: EquipmentItem) => {
    e.stopPropagation();
    e.preventDefault();
    setMaintenancePopover(null);
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

  const fitScreen = () => applyFitToViewport();
  const zoomIn = () => setScale((s) => Math.min(1.8, s * 1.12));
  const zoomOut = () => setScale((s) => Math.max(0.12, s / 1.12));

  const autoArrangeSections = () => {
    const arranged = computeProcessLayoutPlan(allEquipment, maxColumns, {
      ignoreSavedPositions: true,
    });
    for (const item of allEquipment) {
      const pos = arranged.positions.get(item.id);
      if (!pos) continue;
      updateEquipmentProcessPosition(item.id, pos.x, pos.y);
    }
    onLayoutChange?.();
  };

  return (
    <div className="process-view">
      <div className="process-toolbar">
        <span className="process-toolbar-title">Production flow</span>
        <span className="process-toolbar-hint">
          Drag within each section · items snap to grid · view auto-fits
        </span>
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
              const outOfService = equipmentBlocksProduction(item);
              const repairNote = equipmentShowsRepairNoteIndicator(item);
              const hasMaintenanceTag = equipmentHasMaintenanceTag(item);

              return (
                <div
                  key={item.id}
                  className={`process-equipment-node${isDragging ? ' process-equipment-node--dragging' : ''}${selectedId === item.id ? ' process-equipment-node--selected' : ''}${visual.isFermenting ? ' process-equipment-node--fermenting' : ''}${outOfService ? ' process-equipment-node--out-of-service' : ''}${repairNote ? ' process-equipment-node--repair-note' : ''}${hasMaintenanceTag ? ' process-equipment-node--has-maintenance' : ''}`}
                  style={{ left: pos.x, top: pos.y }}
                  onPointerDown={(e) => onEquipmentPointerDown(e, item)}
                  onContextMenu={(e) => onEquipmentContextMenu(e, item)}
                  onClick={(e) => e.stopPropagation()}
                  title={hasMaintenanceTag ? 'Right-click to view maintenance' : undefined}
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
                  {outOfService && (
                    <div className="process-equipment-out-of-service" aria-hidden="true">
                      <svg viewBox="0 0 100 100" className="process-equipment-out-of-service-icon">
                        <line x1="18" y1="18" x2="82" y2="82" />
                        <line x1="82" y1="18" x2="18" y2="82" />
                      </svg>
                    </div>
                  )}
                  {repairNote && (
                    <div className="process-equipment-repair-badge" aria-label="Suggested repairs">
                      <svg viewBox="0 0 24 24" className="process-equipment-repair-badge-icon">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {maintenancePopover && maintenancePopoverEquipment && (
          <ProcessEquipmentMaintenancePopover
            equipment={maintenancePopoverEquipment}
            x={maintenancePopover.x}
            y={maintenancePopover.y}
            onClose={() => setMaintenancePopover(null)}
          />
        )}

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
