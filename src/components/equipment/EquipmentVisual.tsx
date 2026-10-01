import type { EquipmentVisualProps } from './equipment-visual.types';
import { TankVisual } from './TankVisual';
import { tankVisualDataFromVisualData } from './tank-visual-data';
import { FermenterVisual } from './FermenterVisual';
import { StillVisual } from './StillVisual';
import { MashTunVisual } from './MashTunVisual';
import { BoilerVisual } from './BoilerVisual';
import { PumpVisual } from './PumpVisual';
import { HoseVisual } from './HoseVisual';

/** Renders the picture chosen for this equipment. Volume still follows the equipment type. */
export function EquipmentVisual(props: EquipmentVisualProps) {
  const view: EquipmentVisualProps = props.preview
    ? {
      ...props,
      onClick: undefined,
      className: `${props.className ?? ''} equipment-visual--preview`.trim(),
    }
    : props;
  const kind = view.data.icon || view.data.equipmentType;

  switch (kind) {
    case 'holding_tank':
    case 'collection_vessel':
      return (
        <TankVisual
          tank={tankVisualDataFromVisualData(view.data)}
          selected={view.selected}
          size={view.size}
          scaleMultiplier={view.scaleMultiplier}
          labelStyle={view.labelStyle}
          onClick={view.onClick}
          className={view.className}
          preview={view.preview}
        />
      );
    case 'fermenter':
      return <FermenterVisual {...view} />;
    case 'pot_still':
    case 'column_still':
      return <StillVisual {...view} />;
    case 'mash_tun':
      return <MashTunVisual {...view} />;
    case 'pump':
      return <PumpVisual {...view} />;
    case 'hose':
      return <HoseVisual {...view} />;
    case 'boiler':
    case 'other':
    default:
      return <BoilerVisual {...view} />;
  }
}
