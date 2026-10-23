import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Router state a link sets when an Equipment page action should come back when it is done. */
export interface EquipmentReturnState {
  returnTo: string;
}

/** Equipment page URL that reopens with this vessel selected. */
export function equipmentReturnPath(equipmentId?: number | null): string {
  return equipmentId ? `/floor-plan?equipment=${equipmentId}` : '/floor-plan';
}

export function equipmentReturnState(equipmentId?: number | null): EquipmentReturnState {
  return { returnTo: equipmentReturnPath(equipmentId) };
}

export function readEquipmentReturn(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const returnTo = (state as Partial<EquipmentReturnState>).returnTo;
  return typeof returnTo === 'string' && returnTo.startsWith('/floor-plan') ? returnTo : null;
}

/**
 * Remembers the Equipment page link that opened this page. Pages strip their query
 * params after reading them, which drops router state, so the target is kept on mount.
 */
export function useEquipmentReturn() {
  const location = useLocation();
  const navigate = useNavigate();
  const [returnTo, setReturnTo] = useState(() => readEquipmentReturn(location.state));

  const returnToEquipment = useCallback((): boolean => {
    if (!returnTo) return false;
    setReturnTo(null);
    navigate(returnTo);
    return true;
  }, [navigate, returnTo]);

  return { fromEquipment: returnTo != null, returnToEquipment };
}
