import { useCallback, useEffect, useRef, useState } from 'react';
import type { FloorEquipment, FloorEquipmentView, FloorPlan } from '../types';
import { TYPE_COLORS, IN_USE_COLORS, equipmentTypeLabel, getEquipmentDisplayColor } from '../lib/equipment';

const PX_PER_FT = 10;

interface FloorCanvasProps {
  plan: FloorPlan;
  equipment: FloorEquipmentView[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onMoveEnd: (id: number, x: number, y: number) => void;
  onMoveToPlan?: (id: number, targetPlanId: number) => void;
  onDragChange?: (id: number | null) => void;
}

function findPlanDropTarget(clientX: number, clientY: number): number | null {
  const el = document.elementFromPoint(clientX, clientY);
  const tab = el?.closest('[data-plan-drop-id]') as HTMLElement | null;
  if (!tab) return null;
  const planId = Number(tab.dataset.planDropId);
  return Number.isFinite(planId) ? planId : null;
}

export function FloorCanvas({
  plan,
  equipment,
  selectedId,
  onSelect,
  onMoveEnd,
  onMoveToPlan,
  onDragChange,
}: FloorCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ id: number; offsetX: number; offsetY: number } | null>(null);
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);
  const livePosRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const widthPx = plan.width_ft * PX_PER_FT;
  const heightPx = plan.height_ft * PX_PER_FT;

  const clamp = useCallback(
    (item: FloorEquipment, x: number, y: number) => ({
      x: Math.max(0, Math.min(plan.width_ft - item.width_ft, x)),
      y: Math.max(0, Math.min(plan.height_ft - item.depth_ft, y)),
    }),
    [plan.width_ft, plan.height_ft],
  );

  useEffect(() => {
    onDragChange?.(dragging?.id ?? null);
  }, [dragging, onDragChange]);

  useEffect(() => {
    if (!dragging) return;

    const onMovePointer = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      const canvas = canvasRef.current;
      if (!canvas) return;
      const item = equipment.find((eq) => eq.id === dragging.id);
      if (!item) return;

      const rect = canvas.getBoundingClientRect();
      const xFt = (e.clientX - rect.left) / PX_PER_FT - dragging.offsetX;
      const yFt = (e.clientY - rect.top) / PX_PER_FT - dragging.offsetY;
      const clamped = clamp(item, xFt, yFt);
      livePosRef.current = clamped;
      setLivePos(clamped);
    };

    const onUp = (e: PointerEvent) => {
      const targetPlanId = findPlanDropTarget(e.clientX, e.clientY);
      if (targetPlanId != null && targetPlanId !== plan.id && dragging && onMoveToPlan) {
        onMoveToPlan(dragging.id, targetPlanId);
      } else if (livePosRef.current && dragging) {
        onMoveEnd(dragging.id, livePosRef.current.x, livePosRef.current.y);
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
  }, [dragging, equipment, clamp, onMoveEnd, onMoveToPlan, plan.id]);

  const gridLines = [];
  for (let x = 0; x <= plan.width_ft; x += 5) {
    gridLines.push(
      <line key={`v${x}`} x1={x * PX_PER_FT} y1={0} x2={x * PX_PER_FT} y2={heightPx} className="floor-grid-line" />,
    );
  }
  for (let y = 0; y <= plan.height_ft; y += 5) {
    gridLines.push(
      <line key={`h${y}`} x1={0} y1={y * PX_PER_FT} x2={widthPx} y2={y * PX_PER_FT} className="floor-grid-line" />,
    );
  }

  return (
    <div className="floor-canvas-wrap">
      <div className="floor-scale-label">{plan.width_ft} ft</div>
      <div
        ref={canvasRef}
        className="floor-canvas"
        style={{ width: widthPx, height: heightPx }}
        onClick={() => onSelect(null)}
      >
        <svg width={widthPx} height={heightPx} className="floor-grid">
          {gridLines}
        </svg>

        {equipment.map((item) => {
          const color = getEquipmentDisplayColor(item.equipment_type, item.status);
          const isSelected = selectedId === item.id;
          const isDragging = dragging?.id === item.id;
          const posX = isDragging && livePos ? livePos.x : item.pos_x_ft;
          const posY = isDragging && livePos ? livePos.y : item.pos_y_ft;
          const w = item.width_ft * PX_PER_FT;
          const h = item.depth_ft * PX_PER_FT;

          return (
            <div
              key={item.id}
              className={`floor-equipment floor-equipment--${item.equipment_type}${isSelected ? ' selected' : ''}${item.status === 'in_use' ? ' in-use' : ''}${item.status === 'cleaning' ? ' cleaning' : ''}${item.status === 'offline' ? ' offline' : ''}${isDragging ? ' dragging' : ''}`}
              style={{
                left: posX * PX_PER_FT,
                top: posY * PX_PER_FT,
                width: w,
                height: h,
                '--eq-color': color,
              } as React.CSSProperties}
              onClick={(e) => { e.stopPropagation(); onSelect(item.id); }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                onSelect(item.id);
                lastPointerRef.current = { x: e.clientX, y: e.clientY };
                setDragging({
                  id: item.id,
                  offsetX: (e.clientX - e.currentTarget.getBoundingClientRect().left) / PX_PER_FT,
                  offsetY: (e.clientY - e.currentTarget.getBoundingClientRect().top) / PX_PER_FT,
                });
              }}
            >
              <div className="floor-equipment-icon">
                {item.equipment_type === 'fermenter' && <div className="eq-shape eq-fermenter" />}
                {item.equipment_type === 'pot_still' && <div className="eq-shape eq-pot-still" />}
                {item.equipment_type === 'column_still' && <div className="eq-shape eq-column-still" />}
                {item.equipment_type === 'mash_tun' && <div className="eq-shape eq-mash-tun" />}
                {(item.equipment_type === 'holding_tank' || item.equipment_type === 'boiler' || item.equipment_type === 'other') && (
                  <div className="eq-shape eq-tank" />
                )}
              </div>
              <div className="floor-equipment-label">{item.name}</div>
              {item.active_batch_number && (
                <div className="floor-equipment-batch">{item.active_batch_number}</div>
              )}
              {item.equipment_type === 'holding_tank' && item.active_abv != null && item.active_abv > 0 && (
                <div className="floor-equipment-batch">{item.active_abv.toFixed(1)}% ABV</div>
              )}
              {item.equipment_type === 'holding_tank' && item.active_run_count != null && item.active_run_count > 1 && (
                <div className="floor-equipment-batch">{item.active_run_count} runs</div>
              )}
              <div className="floor-equipment-meta">
                {item.active_volume_gal
                  ? `${item.active_volume_gal} gal`
                  : item.capacity_gal > 0
                    ? `${item.capacity_gal} gal cap`
                    : ''}
              </div>
              {item.status === 'in_use' && <div className="floor-equipment-badge">Active</div>}
            </div>
          );
        })}
      </div>
      <div className="floor-scale-label floor-scale-label--vertical">{plan.height_ft} ft</div>
    </div>
  );
}

export function FloorLegend() {
  return (
    <div className="floor-legend">
      <div className="floor-legend-section">
        <span className="floor-legend-heading">Idle</span>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="floor-legend-item">
            <span className="floor-legend-swatch" style={{ background: color }} />
            {equipmentTypeLabel(type as FloorEquipment['equipment_type'])}
          </div>
        ))}
      </div>
      <div className="floor-legend-section">
        <span className="floor-legend-heading">Active</span>
        <div className="floor-legend-item">
          <span className="floor-legend-swatch" style={{ background: IN_USE_COLORS.fermenter }} />
          Fermenter in use
        </div>
        <div className="floor-legend-item">
          <span className="floor-legend-swatch" style={{ background: IN_USE_COLORS.still }} />
          Still in use
        </div>
        <div className="floor-legend-item">
          <span className="floor-legend-swatch" style={{ background: IN_USE_COLORS.holding_tank }} />
          Holding tank
        </div>
      </div>
    </div>
  );
}
