import {
  formatTankSetVolumeOwnerApprovalMessage,
  tankSetVolumeRequiresOwnerAck,
  type TankSetVolumeNotice,
} from '../src/lib/tank-set-volume-notify.js';
import { createStaffMessage, listApprovedOwnerUserIds } from './db.js';

export async function notifyOwnersOfTankSetVolume(
  senderId: number,
  senderRole: string,
  notice: TankSetVolumeNotice,
  requestId?: number,
): Promise<number> {
  if (!tankSetVolumeRequiresOwnerAck(senderRole)) return 0;
  const ownerIds = await listApprovedOwnerUserIds();
  if (ownerIds.length === 0) return 0;
  const body = formatTankSetVolumeOwnerApprovalMessage(notice, requestId);
  let sent = 0;
  for (const ownerId of ownerIds) {
    if (ownerId === senderId) continue;
    const message = await createStaffMessage(
      senderId,
      ownerId,
      body,
      null,
      'Tank set volume',
    );
    if (message) sent += 1;
  }
  return sent;
}

export function tankSetVolumeNoticeFromMutation(
  name: string,
  args: unknown[],
  tankNameFor: (tankId: number) => string,
): TankSetVolumeNotice | null {
  if (name === 'saveHoldingTankOnHand' && args[0] && typeof args[0] === 'object') {
    const input = args[0] as {
      tankEquipmentId?: number;
      volumeGal?: number;
      abv?: number;
      recordedAt?: string;
      notes?: string;
      changedBy?: string;
    };
    const tankId = Number(input.tankEquipmentId);
    if (!Number.isInteger(tankId) || tankId <= 0) return null;
    return {
      action: 'set',
      tankName: tankNameFor(tankId),
      changedBy: String(input.changedBy ?? ''),
      volumeGal: input.volumeGal,
      abv: input.abv,
      recordedAt: input.recordedAt,
      notes: input.notes,
    };
  }
  if (name === 'clearHoldingTankOnHand') {
    const tankId = Number(args[0]);
    const reason = typeof args[1] === 'string' ? args[1] : '';
    const changedBy = typeof args[2] === 'string' ? args[2] : '';
    if (!Number.isInteger(tankId) || tankId <= 0) return null;
    return {
      action: 'clear',
      tankName: tankNameFor(tankId),
      changedBy,
      notes: reason,
    };
  }
  return null;
}