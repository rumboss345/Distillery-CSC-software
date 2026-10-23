import { EQUIPMENT_ICONS, type EquipmentIcon } from '../../lib/equipment';
import { EquipmentVisual } from './EquipmentVisual';
import type { EquipmentVisualData } from './equipment-visual.types';

function previewData(icon: EquipmentIcon, label: string): EquipmentVisualData {
  const tank = icon === 'holding_tank' || icon === 'jug' || icon === 'stillage_tank' || icon === 'collection_vessel';
  const fermenter = icon === 'fermenter';
  const wash = icon === 'mash_tun';
  const still = icon === 'pot_still' || icon === 'column_still';
  const showsFill = tank || fermenter || wash || still;
  const fillPercent = tank ? (icon === 'collection_vessel' ? 46 : 68) : fermenter ? 62 : wash ? 74 : still ? 40 : 0;
  const capacityGal = showsFill ? 100 : 0;
  return {
    id: 0,
    code: '',
    name: label,
    equipmentType: icon,
    icon,
    typeLabel: label,
    capacityGal,
    currentVolumeGal: showsFill ? fillPercent : 0,
    fillPercent,
    liquidName: icon === 'stillage_tank'
      ? 'Stillage'
      : icon === 'collection_vessel'
        ? 'Low wine'
        : tank
          ? 'Hearts'
          : wash
            ? 'Wash'
            : undefined,
    abv: icon === 'stillage_tank' ? 0 : tank ? 65 : undefined,
    status: showsFill ? 'active' : 'available',
    isWashing: wash,
    fermenterLatestBrix: fermenter ? 12 : undefined,
  };
}

export function EquipmentIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: EquipmentIcon) => void;
}) {
  return (
    <div className="equipment-icon-picker" role="radiogroup" aria-label="Equipment icon">
      {EQUIPMENT_ICONS.map((icon) => {
        const selected = value === icon.value;
        return (
          <button
            key={icon.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`equipment-icon-option${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(icon.value)}
          >
            <span className="equipment-icon-option-preview">
              <EquipmentVisual data={previewData(icon.value, icon.label)} preview />
            </span>
            <span className="equipment-icon-option-label">{icon.label}</span>
          </button>
        );
      })}
    </div>
  );
}
