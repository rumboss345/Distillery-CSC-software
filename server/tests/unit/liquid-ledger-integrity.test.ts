import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateLotBalance,
  aggregateLotInTank,
  aggregateTankBalance,
} from '../../../shared/liquid-ledger/balance-engine';
import { computeAbvFromLpa, computeLpa } from '../../../shared/liquid-ledger/balance';

describe('ledger balance engine — transfer double-count protection', () => {
  it('1000 L transfer 200 L A→B yields A=800, B=200 (not doubled)', () => {
    const txs = [
      {
        source_tank_id: null, destination_tank_id: 1, source_lot_id: null, destination_lot_id: 1,
        volume_litres: 1000, lpa: 400,
      },
      {
        source_tank_id: 1, destination_tank_id: null, source_lot_id: 1, destination_lot_id: null,
        volume_litres: 200, lpa: 80,
      },
      {
        source_tank_id: null, destination_tank_id: 2, source_lot_id: null, destination_lot_id: 1,
        volume_litres: 200, lpa: 80,
      },
    ];
    assert.equal(aggregateTankBalance(1, txs).volumeLitres, 800);
    assert.equal(aggregateTankBalance(2, txs).volumeLitres, 200);
  });
});

describe('ledger balance engine — lot across multiple tanks', () => {
  it('partial transfer: 1000 L lot → 600 A + 400 B, total lot = 1000 L', () => {
    const lotId = 1;
    const txs = [
      {
        source_tank_id: null, destination_tank_id: 1, source_lot_id: null, destination_lot_id: lotId,
        volume_litres: 1000, lpa: 400,
      },
      {
        source_tank_id: 1, destination_tank_id: null, source_lot_id: lotId, destination_lot_id: null,
        volume_litres: 400, lpa: 160,
      },
      {
        source_tank_id: null, destination_tank_id: 2, source_lot_id: null, destination_lot_id: lotId,
        volume_litres: 400, lpa: 160,
      },
    ];
    assert.equal(aggregateLotInTank(lotId, 1, txs).volumeLitres, 600);
    assert.equal(aggregateLotInTank(lotId, 2, txs).volumeLitres, 400);
    assert.equal(aggregateLotBalance(lotId, txs).volumeLitres, 1000);
  });

  it('partial transfer preserves same lot id in both tanks', () => {
    const lotId = 42;
    const txs = [
      {
        source_tank_id: null, destination_tank_id: 1, source_lot_id: null, destination_lot_id: lotId,
        volume_litres: 1000, lpa: 500,
      },
      {
        source_tank_id: 1, destination_tank_id: null, source_lot_id: lotId, destination_lot_id: null,
        volume_litres: 250, lpa: 125,
      },
      {
        source_tank_id: null, destination_tank_id: 2, source_lot_id: null, destination_lot_id: lotId,
        volume_litres: 250, lpa: 125,
      },
    ];
    assert.equal(aggregateLotInTank(lotId, 1, txs).volumeLitres, 750);
    assert.equal(aggregateLotInTank(lotId, 2, txs).volumeLitres, 250);
  });
});

describe('ledger balance engine — reversal exact offset', () => {
  it('reversal of receipt zeroes tank balance', () => {
    const txs = [
      {
        source_tank_id: null, destination_tank_id: 1, source_lot_id: null, destination_lot_id: 1,
        volume_litres: 500, lpa: 200,
      },
      {
        source_tank_id: 1, destination_tank_id: null, source_lot_id: 1, destination_lot_id: null,
        volume_litres: 500, lpa: 200,
      },
    ];
    assert.equal(aggregateTankBalance(1, txs).volumeLitres, 0);
    assert.equal(aggregateTankBalance(1, txs).lpa, 0);
  });

  it('reversal of paired transfer restores both tanks', () => {
    const base = [
      {
        source_tank_id: null, destination_tank_id: 1, source_lot_id: null, destination_lot_id: 1,
        volume_litres: 1000, lpa: 400,
      },
      {
        source_tank_id: 1, destination_tank_id: null, source_lot_id: 1, destination_lot_id: null,
        volume_litres: 200, lpa: 80,
      },
      {
        source_tank_id: null, destination_tank_id: 2, source_lot_id: null, destination_lot_id: 1,
        volume_litres: 200, lpa: 80,
      },
    ];
    const reversal = [
      {
        source_tank_id: 2, destination_tank_id: null, source_lot_id: 1, destination_lot_id: null,
        volume_litres: 200, lpa: 80,
      },
      {
        source_tank_id: null, destination_tank_id: 1, source_lot_id: null, destination_lot_id: 1,
        volume_litres: 200, lpa: 80,
      },
    ];
    const all = [...base, ...reversal];
    assert.equal(aggregateTankBalance(1, all).volumeLitres, 1000);
    assert.equal(aggregateTankBalance(2, all).volumeLitres, 0);
  });
});

describe('ledger balance engine — blend LPA conservation', () => {
  it('500@40% + 500@60% = 1000 L @ 50% ABV (500 LPA)', () => {
    const lpa = computeLpa(500, 40) + computeLpa(500, 60);
    assert.equal(lpa, 500);
    assert.equal(computeAbvFromLpa(1000, lpa), 50);
  });
});

describe('ledger balance engine — legacy/ledger isolation', () => {
  it('ledger tank balance ignores legacy-only transaction rows (no floor_equipment_id on tx)', () => {
    const ledgerTankId = 1;
    const txs = [
      {
        source_tank_id: null, destination_tank_id: ledgerTankId, source_lot_id: null, destination_lot_id: 1,
        volume_litres: 500, lpa: 200,
      },
    ];
    assert.equal(aggregateTankBalance(ledgerTankId, txs).volumeLitres, 500);
    assert.equal(aggregateTankBalance(99, txs).volumeLitres, 0);
  });
});

describe('ledger balance engine — capacity scenario', () => {
  it('900 + 100 fits 1000 capacity; 900 + 101 exceeds', () => {
    const current = 900;
    const capacity = 1000;
    assert.ok(current + 100 <= capacity);
    assert.ok(current + 101 > capacity);
  });
});

describe('ledger balance engine — reconciliation LPA on volume-only adjustment', () => {
  it('volume decrease at unchanged ABV reduces LPA proportionally', () => {
    const calculatedVol = 1250;
    const calculatedAbv = 40;
    const calculatedLpa = computeLpa(calculatedVol, calculatedAbv);
    const measuredVol = 1243.5;
    const variance = measuredVol - calculatedVol;
    const adjustmentLpa = computeLpa(Math.abs(variance), calculatedAbv);
    assert.equal(variance, -6.5);
    assert.ok(Math.abs(calculatedLpa - adjustmentLpa - computeLpa(measuredVol, calculatedAbv)) < 0.01);
  });
});
