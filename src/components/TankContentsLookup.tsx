import { useState } from 'react';
import {
  getCollectionVessels,
  getHoldingTankContents,
  getHoldingTanks,
  getStillageTanks,
} from '../db/queries';
import { tankContentsPhrase } from '../lib/tank-menu-label';

interface TankChoice {
  id: number;
  name: string;
  kind: string;
  capacity_gal: number;
}

function tankChoices(): TankChoice[] {
  const options = { includeUnavailable: true as const };
  return [
    ...getHoldingTanks(options).map((tank) => ({ ...tank, kind: 'Holding tank' })),
    ...getStillageTanks(options).map((tank) => ({ ...tank, kind: 'Stillage tank' })),
    ...getCollectionVessels(options).map((tank) => ({ ...tank, kind: 'Collection vessel' })),
  ];
}

/** Select any tank and read what it currently holds. */
export function TankContentsLookup() {
  const tanks = tankChoices();
  const [tankId, setTankId] = useState<number | ''>('');
  const tank = tanks.find((item) => item.id === tankId) ?? null;
  const contents = tank ? getHoldingTankContents(tank.id) : null;
  const hasLiquid = (contents?.volume_gal ?? 0) > 0.001;
  const phrase = tank && hasLiquid ? (tankContentsPhrase(tank.id) ?? 'Spirit') : null;

  return (
    <section className="card tank-contents-lookup" data-testid="tank-contents-lookup">
      <h3 className="section-title">Tank contents</h3>
      <p className="field-hint">Select a tank to see what is in it.</p>
      <label className="form-group">
        Tank
        <select
          data-testid="tank-contents-select"
          value={tankId}
          onChange={(event) => setTankId(event.target.value ? Number(event.target.value) : '')}
        >
          <option value="">Select a tank…</option>
          {tanks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.kind} — {item.name}
            </option>
          ))}
        </select>
      </label>
      {tank && contents && (
        <div className="tank-contents-card" data-testid="tank-contents-result">
          <div className="tank-contents-kicker">In this tank</div>
          <strong>{tank.name}</strong>
          {hasLiquid ? (
            <p>
              {phrase}
              {' · '}
              {contents.volume_gal.toFixed(1)} gal
              {contents.abv > 0 ? ` · ${contents.abv.toFixed(1)}% ABV` : ''}
              {tank.capacity_gal > 0 ? ` · capacity ${tank.capacity_gal} gal` : ''}
            </p>
          ) : (
            <p>Empty. Nothing is stored in this tank.</p>
          )}
        </div>
      )}
    </section>
  );
}
