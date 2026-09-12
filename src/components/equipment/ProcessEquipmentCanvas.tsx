import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAllFloorEquipmentWithContext,
  getEquipmentVolumeReport,
  getFloorPlans,
  getProductionSummary,
} from '../../db/queries';
import { buildEquipmentVisualData } from './equipment-visual-shared';
import { groupEquipmentByStage } from './process-stages';
import { EquipmentVisual } from './EquipmentVisual';
import { TankLevelsPanel } from './TankLevelsPanel';
import type { EquipmentVisualData } from './equipment-visual.types';
import './process-view.css';

interface ProcessEquipmentCanvasProps {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  refreshKey: number;
}

export function ProcessEquipmentCanvas({
  selectedId,
  onSelect,
  refreshKey,
}: ProcessEquipmentCanvasProps) {
  void refreshKey;

  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const plans = getFloorPlans();
  const volumeById = useMemo(() => {
    const map = new Map<number, ReturnType<typeof getEquipmentVolumeReport>[0]>();
    for (const row of getEquipmentVolumeReport()) map.set(row.id, row);
    return map;
  }, [refreshKey]);

  const allEquipment = useMemo(() => {
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
  const tanks = useMemo(
    () => [...visualById.values()].filter((v) => v.equipmentType === 'holding_tank'),
    [visualById],
  );

  const summary = getProductionSummary();
  const offlineCount = allEquipment.filter((e) => e.status === 'offline').length;

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.equipment-visual, .tank-visual')) return;
    setPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!panning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  };

  const onPointerUp = () => setPanning(false);

  const fitScreen = () => { setScale(1); setPan({ x: 0, y: 0 }); };
  const zoomIn = () => setScale((s) => Math.min(1.8, s * 1.12));
  const zoomOut = () => setScale((s) => Math.max(0.45, s / 1.12));

  return (
    <div className="process-view">
      <div className="process-toolbar">
        <span className="process-toolbar-title">Distillery Process View</span>
        <div className="process-toolbar-actions">
          <button type="button" className="btn btn-sm btn-secondary" onClick={zoomOut}>−</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={fitScreen}>Fit</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={zoomIn}>+</button>
        </div>
      </div>

      <div className="process-body">
        <div
          ref={viewportRef}
          className={`process-viewport${panning ? ' process-viewport--panning' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('.equipment-visual, .tank-visual')) return;
            onSelect(null);
          }}
        >
          <div
            className="process-canvas"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
          >
            {stages.map(({ stage, items }, idx) => (
              <section key={stage.key} className="process-stage">
                <div className="process-stage-header">
                  <span className="process-stage-label">{stage.label}</span>
                  <span className="process-stage-count">{items.length} unit{items.length === 1 ? '' : 's'}</span>
                </div>
                <div className="process-stage-row">
                  {items.map((item) => {
                    const visual = visualById.get(item.id)!;
                    return (
                      <EquipmentVisual
                        key={item.id}
                        data={visual}
                        selected={selectedId === item.id}
                        onClick={() => onSelect(item.id)}
                      />
                    );
                  })}
                </div>
                {idx < stages.length - 1 && (
                  <div className="process-flow-connector" aria-hidden>
                    <div className="process-flow-line" />
                    <div className="process-flow-arrow" />
                  </div>
                )}
              </section>
            ))}
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
