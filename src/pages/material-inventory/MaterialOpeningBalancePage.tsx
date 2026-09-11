import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { masterDataRepository, materialInventoryRepository } from '../../db/repositories';
import type { MaterialType } from '../../../shared/material-inventory/constants';

type MaterialOption = {
  id: number;
  name: string;
  code: string;
  unit: string;
  materialType: MaterialType;
};

export function MaterialOpeningBalancePage() {
  const [materialType, setMaterialType] = useState<MaterialType>('RAW_MATERIAL');
  const [materialId, setMaterialId] = useState(0);
  const [lotMode, setLotMode] = useState<'existing' | 'new'>('new');
  const [existingLotId, setExistingLotId] = useState(0);
  const [supplierLotNumber, setSupplierLotNumber] = useState('');
  const [locationId, setLocationId] = useState(0);
  const [quantity, setQuantity] = useState(0);
  const [unit, setUnit] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [postedBalance, setPostedBalance] = useState<number | null>(null);

  const ledgerMaterials = useMemo((): MaterialOption[] => {
    const raw = masterDataRepository.rawMaterials.list()
      .filter((m) => (m.inventory_tracking_mode ?? 'LEGACY') === 'LEDGER')
      .map((m) => ({ id: m.id, name: m.name, code: m.material_code, unit: m.inventory_unit, materialType: 'RAW_MATERIAL' as const }));
    const pkg = masterDataRepository.packagingMaterials.list()
      .filter((m) => (m.inventory_tracking_mode ?? 'LEGACY') === 'LEDGER')
      .map((m) => ({ id: m.id, name: m.name, code: m.packaging_code, unit: m.inventory_unit, materialType: 'PACKAGING_MATERIAL' as const }));
    return materialType === 'RAW_MATERIAL' ? raw : pkg;
  }, [materialType]);

  const selectedMaterial = ledgerMaterials.find((m) => m.id === materialId);
  const locations = masterDataRepository.locations.list(true);
  const existingLots = materialInventoryRepository.lots.list({
    materialType,
    rawMaterialId: materialType === 'RAW_MATERIAL' ? materialId : undefined,
    packagingMaterialId: materialType === 'PACKAGING_MATERIAL' ? materialId : undefined,
  });

  const handleMaterialChange = (nextType: MaterialType, nextId: number) => {
    setMaterialType(nextType);
    setMaterialId(nextId);
    const mat = (nextType === 'RAW_MATERIAL'
      ? masterDataRepository.rawMaterials.list()
      : masterDataRepository.packagingMaterials.list()
    ).find((m) => m.id === nextId);
    setUnit(mat && 'inventory_unit' in mat ? mat.inventory_unit : '');
    setExistingLotId(0);
    setError('');
    setSuccess('');
    setPostedBalance(null);
  };

  const handlePost = () => {
    setError('');
    setSuccess('');
    setPostedBalance(null);
    if (!materialId) {
      setError('Select a LEDGER-managed material.');
      return;
    }
    if (!locationId) {
      setError('Select a location.');
      return;
    }
    if (quantity <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }
    if (!notes.trim()) {
      setError('Reference/note is required.');
      return;
    }
    try {
      let lotId = existingLotId;
      if (lotMode === 'new') {
        lotId = materialInventoryRepository.lots.create({
          materialType,
          rawMaterialId: materialType === 'RAW_MATERIAL' ? materialId : null,
          packagingMaterialId: materialType === 'PACKAGING_MATERIAL' ? materialId : null,
          supplierLotNumber: supplierLotNumber.trim() || null,
          receivedDate: effectiveDate,
          status: 'Active',
          notes: notes.trim(),
        });
      } else if (!lotId) {
        setError('Select an existing lot or create a new one.');
        return;
      }
      materialInventoryRepository.ledger.postOpeningBalance({
        materialType,
        rawMaterialId: materialType === 'RAW_MATERIAL' ? materialId : null,
        packagingMaterialId: materialType === 'PACKAGING_MATERIAL' ? materialId : null,
        materialLotId: lotId,
        locationId,
        quantity,
        unit: unit || selectedMaterial?.unit || 'each',
        effectiveDate,
        notes: notes.trim(),
      });
      const lotBal = materialInventoryRepository.balance.getLotBalanceByLocation(lotId, locationId);
      const matBal = materialInventoryRepository.tracking.getLedgerInfo(materialType, materialId).onHand;
      setPostedBalance(lotBal);
      setSuccess(`Opening balance posted. Lot at location: ${lotBal.toFixed(3)} ${unit || selectedMaterial?.unit}. Material on hand: ${matBal.toFixed(3)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Posting failed.');
    }
  };

  if (ledgerMaterials.length === 0) {
    return (
      <section className="card">
        <h2>Post Opening Balance</h2>
        <p className="text-muted">
          No LEDGER-managed materials yet. Activate ledger tracking on a material under{' '}
          <Link to="/material-inventory/raw-materials">Material Inventory</Link> or{' '}
          <Link to="/master-data/materials">Master Data → Materials</Link> first.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Post Opening Balance</h2>
      <p className="text-muted">
        Establish ledger quantity for existing physical stock at a specific lot and location.
        Legacy inventory is never imported automatically — enter counts from your physical verification.
      </p>
      <div className="form-grid" style={{ maxWidth: 640 }}>
        <div className="form-group">
          <label>Material type</label>
          <select
            className="form-control"
            value={materialType}
            onChange={(e) => {
              const t = e.target.value as MaterialType;
              setMaterialType(t);
              setMaterialId(0);
              setUnit('');
            }}
          >
            <option value="RAW_MATERIAL">Raw Material</option>
            <option value="PACKAGING_MATERIAL">Packaging Material</option>
          </select>
        </div>
        <div className="form-group">
          <label>Material (LEDGER only) *</label>
          <select
            className="form-control"
            value={materialId || ''}
            onChange={(e) => handleMaterialChange(materialType, Number(e.target.value))}
          >
            <option value="">Select…</option>
            {ledgerMaterials.map((m) => (
              <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Lot</label>
          <select className="form-control" value={lotMode} onChange={(e) => setLotMode(e.target.value as 'existing' | 'new')}>
            <option value="new">Create new lot</option>
            <option value="existing">Use existing lot</option>
          </select>
        </div>
        {lotMode === 'new' ? (
          <div className="form-group">
            <label>Supplier lot # (optional)</label>
            <input className="form-control" value={supplierLotNumber} onChange={(e) => setSupplierLotNumber(e.target.value)} />
          </div>
        ) : (
          <div className="form-group">
            <label>Existing lot *</label>
            <select className="form-control" value={existingLotId || ''} onChange={(e) => setExistingLotId(Number(e.target.value))}>
              <option value="">Select…</option>
              {existingLots.map((l) => (
                <option key={l.id} value={l.id}>{l.lot_code} — {l.status}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <label>Location *</label>
          <select className="form-control" value={locationId || ''} onChange={(e) => setLocationId(Number(e.target.value))}>
            <option value="">Select…</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.location_code} — {loc.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Quantity *</label>
          <input type="number" className="form-control" min={0} step="any" value={quantity || ''} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label>Unit *</label>
          <input className="form-control" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={selectedMaterial?.unit ?? 'each'} />
        </div>
        <div className="form-group">
          <label>Effective date *</label>
          <input type="date" className="form-control" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </div>
        <div className="form-group full-width">
          <label>Reference / note *</label>
          <textarea className="form-control" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Warehouse opening balance setup" />
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {success && (
        <div className="alert alert-success">
          {success}
          {postedBalance != null && selectedMaterial && (
            <div style={{ marginTop: '0.5rem' }}>
              Ledger result at location: <strong>{postedBalance.toFixed(3)} {unit || selectedMaterial.unit}</strong>
            </div>
          )}
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={handlePost}>Post Opening Balance</button>
      </div>
    </section>
  );
}
