import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { liquidInventoryRepository, masterDataRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';
import { formatVolume } from '../../../shared/units';
import type { LiqTankSaveInput } from '../../types/liquid-ledger';

const emptyTank = (): LiqTankSaveInput => ({
  name: '',
  tank_type: 'Spirit Holding',
  capacity_litres: 5000,
  minimum_working_volume_litres: null,
  location_id: null,
  floor_equipment_id: null,
  tracking_mode: 'LEDGER',
  status: 'Active',
  notes: '',
});

export function TankBoardPage() {
  const { user } = useAuth();
  const { key, refresh } = useRefreshKey();
  const [showTankForm, setShowTankForm] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showOpening, setShowOpening] = useState(false);
  const [tankForm, setTankForm] = useState(emptyTank());
  const [error, setError] = useState('');

  const [receipt, setReceipt] = useState({
    bulkSpiritId: 0,
    volumeLitres: 1000,
    abv: 96,
    destinationTankId: 0,
    receivedDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [transfer, setTransfer] = useState({
    sourceTankId: 0,
    destinationTankId: 0,
    volumeLitres: 100,
    notes: '',
  });
  const [opening, setOpening] = useState({
    tankId: 0,
    lotType: 'Finished Spirit',
    description: 'Opening balance',
    volumeLitres: 0,
    abv: 40,
    effectiveDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  void key;
  const ledgerTanks = liquidInventoryRepository.tanks.listTanks();
  const legacyTanks = liquidInventoryRepository.tanks.listLegacyFloorTanks();
  const bulkSpirits = masterDataRepository.bulkSpirits.list().filter((b) => b.active);
  const tankTypes = liquidInventoryRepository.lookups.tankTypes();
  const lotTypes = liquidInventoryRepository.lookups.lotTypes();

  const ledgerRows = useMemo(() => ledgerTanks.map((t) => {
    let balance;
    try {
      balance = liquidInventoryRepository.tanks.getTankBalance(t.id);
    } catch {
      balance = null;
    }
    return { tank: t, balance };
  }), [key, ledgerTanks]);

  const handleSaveTank = () => {
    try {
      liquidInventoryRepository.tanks.saveTank(tankForm);
      setShowTankForm(false);
      setTankForm(emptyTank());
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleReceipt = () => {
    try {
      liquidInventoryRepository.ledger.receiveBulkSpirit({
        ...receipt,
        createdBy: user?.email ?? null,
      });
      setShowReceipt(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Receipt failed');
    }
  };

  const handleTransfer = () => {
    try {
      liquidInventoryRepository.ledger.transferLiquid({
        ...transfer,
        createdBy: user?.email ?? null,
      });
      setShowTransfer(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
    }
  };

  const handleOpening = () => {
    try {
      liquidInventoryRepository.ledger.postOpeningBalance({
        ...opening,
        createdBy: user?.email ?? null,
      });
      setShowOpening(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opening balance failed');
    }
  };

  return (
    <>
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={() => { setError(''); setShowTankForm(true); }}>
          New Ledger Tank
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => { setError(''); setShowReceipt(true); }}>
          Bulk Spirit Receipt
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => { setError(''); setShowTransfer(true); }}>
          Tank Transfer
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => { setError(''); setShowOpening(true); }}>
          Opening Balance
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}

      <section className="card">
        <h2>Ledger-Managed Tanks</h2>
        <p className="text-muted">Balances calculated from immutable transactions only.</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Volume (L)</th>
              <th>US gal</th>
              <th>ABV</th>
              <th>LPA</th>
              <th>Capacity</th>
              <th>Util %</th>
              <th>Lot</th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.length === 0 && (
              <tr><td colSpan={10} className="empty-row">No ledger tanks yet. Create one to begin tracking.</td></tr>
            )}
            {ledgerRows.map(({ tank, balance }) => (
              <tr key={tank.id}>
                <td>{tank.tank_code}</td>
                <td>{tank.name}</td>
                <td>{tank.tank_type}</td>
                <td>{balance ? balance.volumeLitres.toFixed(2) : '—'}</td>
                <td>{balance ? formatVolume(balance.volumeLitres, 'US_gal') : '—'}</td>
                <td>{balance ? `${balance.abv.toFixed(2)}%` : '—'}</td>
                <td>{balance ? balance.lpa.toFixed(2) : '—'}</td>
                <td>{tank.capacity_litres.toFixed(0)} L</td>
                <td>{balance ? `${balance.utilizationPercent.toFixed(1)}%` : '—'}</td>
                <td>{balance?.isMixed ? 'Mixed' : (balance?.primaryLotCode ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: '1.5rem' }}>
        <h2>Legacy Floor Tanks (Distillation-Calculated)</h2>
        <p className="text-muted">
          Existing production tanks remain LEGACY until explicitly migrated via Opening Balance.
          These balances are NOT included in ledger totals.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Mode</th>
              <th>Volume (US gal)</th>
              <th>ABV</th>
            </tr>
          </thead>
          <tbody>
            {legacyTanks.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td><span className="badge badge-muted">{t.trackingMode}</span></td>
                <td>{t.volumeGal.toFixed(2)}</td>
                <td>{t.abv.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {showTankForm && <Modal title="New Ledger Tank" onClose={() => setShowTankForm(false)}>
        <div className="form-grid">
          <label>Name<input value={tankForm.name} onChange={(e) => setTankForm({ ...tankForm, name: e.target.value })} /></label>
          <label>Type
            <select value={tankForm.tank_type} onChange={(e) => setTankForm({ ...tankForm, tank_type: e.target.value })}>
              {tankTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Capacity (L)
            <input type="number" value={tankForm.capacity_litres} onChange={(e) => setTankForm({ ...tankForm, capacity_litres: Number(e.target.value) })} />
          </label>
          <label>Notes<textarea value={tankForm.notes} onChange={(e) => setTankForm({ ...tankForm, notes: e.target.value })} /></label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowTankForm(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSaveTank}>Save</button>
        </div>
      </Modal>}

      {showReceipt && <Modal title="Bulk Spirit Receipt" onClose={() => setShowReceipt(false)}>
        <div className="form-grid">
          <label>Bulk Spirit
            <select value={receipt.bulkSpiritId} onChange={(e) => setReceipt({ ...receipt, bulkSpiritId: Number(e.target.value) })}>
              <option value={0}>Select…</option>
              {bulkSpirits.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label>Destination Tank
            <select value={receipt.destinationTankId} onChange={(e) => setReceipt({ ...receipt, destinationTankId: Number(e.target.value) })}>
              <option value={0}>Select…</option>
              {ledgerTanks.map((t) => <option key={t.id} value={t.id}>{t.tank_code} — {t.name}</option>)}
            </select>
          </label>
          <label>Volume (L)<input type="number" value={receipt.volumeLitres} onChange={(e) => setReceipt({ ...receipt, volumeLitres: Number(e.target.value) })} /></label>
          <label>ABV %<input type="number" value={receipt.abv} onChange={(e) => setReceipt({ ...receipt, abv: Number(e.target.value) })} /></label>
          <label>Received Date<input type="date" value={receipt.receivedDate} onChange={(e) => setReceipt({ ...receipt, receivedDate: e.target.value })} /></label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowReceipt(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleReceipt}>Post Receipt</button>
        </div>
      </Modal>}

      {showTransfer && <Modal title="Tank Transfer" onClose={() => setShowTransfer(false)}>
        <div className="form-grid">
          <label>Source Tank
            <select value={transfer.sourceTankId} onChange={(e) => setTransfer({ ...transfer, sourceTankId: Number(e.target.value) })}>
              <option value={0}>Select…</option>
              {ledgerTanks.map((t) => <option key={t.id} value={t.id}>{t.tank_code} — {t.name}</option>)}
            </select>
          </label>
          <label>Destination Tank
            <select value={transfer.destinationTankId} onChange={(e) => setTransfer({ ...transfer, destinationTankId: Number(e.target.value) })}>
              <option value={0}>Select…</option>
              {ledgerTanks.map((t) => <option key={t.id} value={t.id}>{t.tank_code} — {t.name}</option>)}
            </select>
          </label>
          <label>Volume (L)<input type="number" value={transfer.volumeLitres} onChange={(e) => setTransfer({ ...transfer, volumeLitres: Number(e.target.value) })} /></label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowTransfer(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleTransfer}>Post Transfer</button>
        </div>
      </Modal>}

      {showOpening && <Modal title="Opening Balance" onClose={() => setShowOpening(false)}>
        <div className="form-grid">
          <label>Tank
            <select value={opening.tankId} onChange={(e) => setOpening({ ...opening, tankId: Number(e.target.value) })}>
              <option value={0}>Select…</option>
              {ledgerTanks.map((t) => <option key={t.id} value={t.id}>{t.tank_code} — {t.name}</option>)}
            </select>
          </label>
          <label>Lot Type
            <select value={opening.lotType} onChange={(e) => setOpening({ ...opening, lotType: e.target.value })}>
              {lotTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Description<input value={opening.description} onChange={(e) => setOpening({ ...opening, description: e.target.value })} /></label>
          <label>Volume (L)<input type="number" value={opening.volumeLitres} onChange={(e) => setOpening({ ...opening, volumeLitres: Number(e.target.value) })} /></label>
          <label>ABV %<input type="number" value={opening.abv} onChange={(e) => setOpening({ ...opening, abv: Number(e.target.value) })} /></label>
          <label>Effective Date<input type="date" value={opening.effectiveDate} onChange={(e) => setOpening({ ...opening, effectiveDate: e.target.value })} /></label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowOpening(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleOpening}>Post Opening Balance</button>
        </div>
      </Modal>}
    </>
  );
}
