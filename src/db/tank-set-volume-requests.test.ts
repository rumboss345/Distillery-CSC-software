import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from './schema';
import { bindSqlHandle } from './sql-session';
import { setMutationActorRole } from './mutation-actor';
import {
  approveTankSetVolumeRequest,
  getHoldingTankOnHand,
  getPendingTankSetVolumeRequests,
  queueTankSetVolumeRequest,
  saveHoldingTankOnHand,
} from './queries';

let db: Database;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Floor')`);
  db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
          VALUES (1, 1, 'Hearts', 'holding_tank', 500, 'empty')`);
});

describe('tank set volume owner approval', () => {
  it('queues staff requests without changing the tank until an owner approves', () => {
    setMutationActorRole('user');
    const queued = queueTankSetVolumeRequest('saveHoldingTankOnHand', [{
      tankEquipmentId: 1,
      volumeGal: 90,
      abv: 60,
      recordedAt: '2026-11-20',
      notes: 'Dip reading',
      changedBy: 'Staff',
      liquidLabel: 'Hearts',
    }], 'staff@csc.test');
    expect(queued.pending).toBe(true);
    expect(getHoldingTankOnHand(1)).toBeNull();

    setMutationActorRole('owner');
    approveTankSetVolumeRequest(queued.requestId, 'Owner');
    expect(getHoldingTankOnHand(1)?.measured_volume_gal).toBeCloseTo(90, 1);
    expect(getPendingTankSetVolumeRequests()).toHaveLength(0);
    setMutationActorRole(null);
  });

  it('queues administrator set volume the same as staff', () => {
    db.run('DELETE FROM holding_tank_opening_balances');
    db.run('DELETE FROM tank_set_volume_requests');
    setMutationActorRole('admin');
    const queued = queueTankSetVolumeRequest('saveHoldingTankOnHand', [{
      tankEquipmentId: 1,
      volumeGal: 77,
      abv: 50,
      recordedAt: '2026-11-22',
      notes: 'Admin dip',
      changedBy: 'Admin',
      liquidLabel: 'Hearts',
    }], 'admin@csc.test');
    expect(queued.pending).toBe(true);
    expect(getHoldingTankOnHand(1)).toBeNull();
    setMutationActorRole(null);
  });

  it('lets owners save tank volume directly', () => {
    db.run('DELETE FROM holding_tank_opening_balances');
    db.run('DELETE FROM tank_set_volume_requests');
    setMutationActorRole('owner');
    saveHoldingTankOnHand({
      tankEquipmentId: 1,
      volumeGal: 44,
      abv: 55,
      recordedAt: '2026-11-21',
      notes: 'Owner dip',
      changedBy: 'Owner',
      liquidLabel: 'Hearts',
    });
    expect(getHoldingTankOnHand(1)?.measured_volume_gal).toBeCloseTo(44, 1);
    setMutationActorRole(null);
  });
});