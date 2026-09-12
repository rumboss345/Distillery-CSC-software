import type { EquipmentVisualProps } from './equipment-visual.types';
import { TankVisual } from './TankVisual';
import { tankVisualDataFromVisualData } from './tank-visual-data';
import { FermenterVisual } from './FermenterVisual';
import { StillVisual } from './StillVisual';
import { MashTunVisual } from './MashTunVisual';
import { BoilerVisual } from './BoilerVisual';

/** Renders the appropriate SCADA visual for any floor equipment type. */
export function EquipmentVisual(props: EquipmentVisualProps) {
  const { data } = props;

  switch (data.equipmentType) {
    case 'holding_tank':
      return (
        <TankVisual
          tank={tankVisualDataFromVisualData(data)}
          selected={props.selected}
          size={props.size}
          onClick={props.onClick}
          className={props.className}
        />
      );
    case 'fermenter':
      return <FermenterVisual {...props} />;
    case 'pot_still':
    case 'column_still':
      return <StillVisual {...props} />;
    case 'mash_tun':
      return <MashTunVisual {...props} />;
    case 'boiler':
    case 'other':
    default:
      return <BoilerVisual {...props} />;
  }
}
