import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { ActivateLedgerDialog, PostActivationBanner } from '../../components/material-inventory/ActivateLedgerDialog';
import { ActiveBadge } from '../../components/master-data/ActiveBadge';
import { masterDataRepository } from '../../db/repositories/master-data-repository';
import { materialInventoryRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';
import { LOOKUP_TYPES } from '../../../shared/master-data/constants';
import { buildMaterialLedgerDisplay } from '../../../shared/material-inventory/ledger-activation-ui';
import type { MdPackagingMaterial, MdRawMaterial } from '../../types/master-data';

type Tab = 'raw' | 'packaging';

const emptyRaw = (): Omit<MdRawMaterial, 'id' | 'material_code' | 'created_at' | 'updated_at' | 'supplier_name'> => ({
  name: '', material_type: 'Fermentation Ingredient', inventory_unit: 'lb', purchase_unit: 'bag',
  conversion_factor: 1, preferred_supplier_id: null, reorder_level: null, reorder_quantity: null,
  standard_cost: null, last_cost: null, purchase_currency: 'USD', active: 1, lot_tracked: 0, expiration_tracked: 0, notes: '',
});

const emptyPkg = (): Omit<MdPackagingMaterial, 'id' | 'packaging_code' | 'created_at' | 'updated_at' | 'supplier_name'> => ({
  name: '', packaging_type: 'Bottle', size_description: '', inventory_unit: 'each', purchase_unit: 'case',
  units_per_purchase_unit: 1, preferred_supplier_id: null, reorder_level: null, reorder_quantity: null,
  standard_cost: null, last_cost: null, purchase_currency: 'USD', active: 1, lot_tracked: 0, notes: '',
});

export function MaterialsPage() {
  const { key, refresh } = useRefreshKey();
  const [tab, setTab] = useState<Tab>('raw');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number>();
  const [rawForm, setRawForm] = useState(emptyRaw());
  const [pkgForm, setPkgForm] = useState(emptyPkg());
  const [error, setError] = useState('');
  const [activateRaw, setActivateRaw] = useState<MdRawMaterial | null>(null);
  const [activatePkg, setActivatePkg] = useState<MdPackagingMaterial | null>(null);
  const [justActivated, setJustActivated] = useState<string | null>(null);

  void key;
  const suppliers = masterDataRepository.suppliers.list(true);
  const materialTypes = masterDataRepository.lookups.get(LOOKUP_TYPES.MATERIAL_TYPE);
  const packagingTypes = masterDataRepository.lookups.get(LOOKUP_TYPES.PACKAGING_TYPE);
  const weightUnits = masterDataRepository.units.codes('weight');
  const countUnits = masterDataRepository.units.codes('count');

  const rawItems = useMemo(() => {
    let rows = masterDataRepository.rawMaterials.list();
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.material_code.toLowerCase().includes(q));
    }
    return rows;
  }, [key, search]);

  const pkgItems = useMemo(() => {
    let rows = masterDataRepository.packagingMaterials.list();
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.packaging_code.toLowerCase().includes(q));
    }
    return rows;
  }, [key, search]);

  const openNew = () => {
    setEditId(undefined);
    setRawForm(emptyRaw());
    setPkgForm(emptyPkg());
    setError('');
    setShowForm(true);
  };

  const openEditRaw = (row: MdRawMaterial) => {
    setTab('raw');
    setEditId(row.id);
    setRawForm({ name: row.name, material_type: row.material_type, inventory_unit: row.inventory_unit, purchase_unit: row.purchase_unit,
      conversion_factor: row.conversion_factor, preferred_supplier_id: row.preferred_supplier_id, reorder_level: row.reorder_level,
      reorder_quantity: row.reorder_quantity, standard_cost: row.standard_cost, last_cost: row.last_cost, purchase_currency: row.purchase_currency,
      active: row.active, lot_tracked: row.lot_tracked, expiration_tracked: row.expiration_tracked, notes: row.notes });
    setError('');
    setShowForm(true);
  };

  const openEditPkg = (row: MdPackagingMaterial) => {
    setTab('packaging');
    setEditId(row.id);
    setPkgForm({ name: row.name, packaging_type: row.packaging_type, size_description: row.size_description,
      inventory_unit: row.inventory_unit, purchase_unit: row.purchase_unit, units_per_purchase_unit: row.units_per_purchase_unit,
      preferred_supplier_id: row.preferred_supplier_id, reorder_level: row.reorder_level, reorder_quantity: row.reorder_quantity,
      standard_cost: row.standard_cost, last_cost: row.last_cost, purchase_currency: row.purchase_currency,
      active: row.active, lot_tracked: row.lot_tracked, notes: row.notes });
    setError('');
    setShowForm(true);
  };

  const handleSave = () => {
    try {
      if (tab === 'raw') masterDataRepository.rawMaterials.save(rawForm, editId);
      else masterDataRepository.packagingMaterials.save(pkgForm, editId);
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const toggleActive = (id: number, active: number) => {
    if (tab === 'raw') masterDataRepository.rawMaterials.setActive(id, !active);
    else masterDataRepository.packagingMaterials.setActive(id, !active);
    refresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button className={`btn btn-sm${tab === 'raw' ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setTab('raw')}>Raw Materials</button>
        <button className={`btn btn-sm${tab === 'packaging' ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setTab('packaging')}>Packaging Materials</button>
      </div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <input className="form-control" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <button className="btn btn-primary" onClick={openNew}>+ Add {tab === 'raw' ? 'Raw Material' : 'Packaging'}</button>
      </div>
      {justActivated && (
        <PostActivationBanner materialName={justActivated} onDismiss={() => setJustActivated(null)} />
      )}
      {tab === 'raw' ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Tracking</th><th>Ledger</th><th>Inv Unit</th><th>Supplier</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rawItems.map((row) => {
                const info = materialInventoryRepository.tracking.getLedgerInfo('RAW_MATERIAL', row.id);
                const display = buildMaterialLedgerDisplay({
                  trackingMode: info.trackingMode,
                  onHand: info.onHand,
                  ledgerActivatedAt: info.ledgerActivatedAt,
                  ledgerActivationReference: info.ledgerActivationReference,
                  hasLedgerTransactions: info.hasLedgerTransactions,
                });
                return (
                  <tr key={row.id}>
                    <td>{row.material_code}</td><td>{row.name}</td><td>{row.material_type}</td>
                    <td><strong>{display.trackingLabel}</strong></td>
                    <td>{display.ledgerBalanceLabel}</td>
                    <td>{row.inventory_unit}</td>
                    <td>{row.supplier_name ?? '—'}</td>
                    <td><ActiveBadge active={row.active} /></td>
                    <td>
                      {display.showActivateAction && (
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => setActivateRaw(row)}>Activate Ledger</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditRaw(row)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(row.id, row.active)}>{row.active ? 'Deactivate' : 'Activate'}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Tracking</th><th>Ledger</th><th>Inv Unit</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pkgItems.map((row) => {
                const info = materialInventoryRepository.tracking.getLedgerInfo('PACKAGING_MATERIAL', row.id);
                const display = buildMaterialLedgerDisplay({
                  trackingMode: info.trackingMode,
                  onHand: info.onHand,
                  ledgerActivatedAt: info.ledgerActivatedAt,
                  ledgerActivationReference: info.ledgerActivationReference,
                  hasLedgerTransactions: info.hasLedgerTransactions,
                });
                return (
                  <tr key={row.id}>
                    <td>{row.packaging_code}</td><td>{row.name}</td><td>{row.packaging_type}</td>
                    <td><strong>{display.trackingLabel}</strong></td>
                    <td>{display.ledgerBalanceLabel}</td>
                    <td>{row.inventory_unit}</td>
                    <td><ActiveBadge active={row.active} /></td>
                    <td>
                      {display.showActivateAction && (
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => setActivatePkg(row)}>Activate Ledger</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditPkg(row)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(row.id, row.active)}>{row.active ? 'Deactivate' : 'Activate'}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-muted" style={{ marginTop: '1rem' }}>
        Ledger inventory is managed under <Link to="/material-inventory">Material Inventory</Link>.
        Activating ledger tracking does not import legacy quantities.
      </p>
      {activateRaw && (
        <ActivateLedgerDialog
          materialName={activateRaw.name}
          onClose={() => setActivateRaw(null)}
          onConfirm={(reference) => {
            materialInventoryRepository.tracking.activateLedger('RAW_MATERIAL', activateRaw.id, reference);
            setJustActivated(activateRaw.name);
            setActivateRaw(null);
            refresh();
          }}
        />
      )}
      {activatePkg && (
        <ActivateLedgerDialog
          materialName={activatePkg.name}
          onClose={() => setActivatePkg(null)}
          onConfirm={(reference) => {
            materialInventoryRepository.tracking.activateLedger('PACKAGING_MATERIAL', activatePkg.id, reference);
            setJustActivated(activatePkg.name);
            setActivatePkg(null);
            refresh();
          }}
        />
      )}
      {showForm && (
        <Modal title={editId ? 'Edit Material' : 'Add Material'} onClose={() => setShowForm(false)}>
          {error && <div className="alert alert-danger">{error}</div>}
          {tab === 'raw' ? (
            <div className="form-grid">
              <div className="form-group"><label>Name *</label><input className="form-control" value={rawForm.name} onChange={(e) => setRawForm({ ...rawForm, name: e.target.value })} /></div>
              <div className="form-group"><label>Type</label>
                <select className="form-control" value={rawForm.material_type} onChange={(e) => setRawForm({ ...rawForm, material_type: e.target.value })}>
                  {materialTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div className="form-group"><label>Inventory Unit *</label>
                <select className="form-control" value={rawForm.inventory_unit} onChange={(e) => setRawForm({ ...rawForm, inventory_unit: e.target.value })}>
                  {weightUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                </select></div>
              <div className="form-group"><label>Purchase Unit *</label><input className="form-control" value={rawForm.purchase_unit} onChange={(e) => setRawForm({ ...rawForm, purchase_unit: e.target.value })} /></div>
              <div className="form-group"><label>Conversion Factor *</label><input type="number" className="form-control" value={rawForm.conversion_factor} onChange={(e) => setRawForm({ ...rawForm, conversion_factor: Number(e.target.value) })} /></div>
              <div className="form-group"><label>Preferred Supplier</label>
                <select className="form-control" value={rawForm.preferred_supplier_id ?? ''} onChange={(e) => setRawForm({ ...rawForm, preferred_supplier_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                </select></div>
              <div className="form-group full-width"><label>Notes</label><textarea className="form-control" rows={2} value={rawForm.notes} onChange={(e) => setRawForm({ ...rawForm, notes: e.target.value })} /></div>
            </div>
          ) : (
            <div className="form-grid">
              <div className="form-group"><label>Name *</label><input className="form-control" value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} /></div>
              <div className="form-group"><label>Type</label>
                <select className="form-control" value={pkgForm.packaging_type} onChange={(e) => setPkgForm({ ...pkgForm, packaging_type: e.target.value })}>
                  {packagingTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div className="form-group"><label>Size Description</label><input className="form-control" value={pkgForm.size_description} onChange={(e) => setPkgForm({ ...pkgForm, size_description: e.target.value })} /></div>
              <div className="form-group"><label>Inventory Unit</label>
                <select className="form-control" value={pkgForm.inventory_unit} onChange={(e) => setPkgForm({ ...pkgForm, inventory_unit: e.target.value })}>
                  {countUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                </select></div>
              <div className="form-group"><label>Purchase Unit</label><input className="form-control" value={pkgForm.purchase_unit} onChange={(e) => setPkgForm({ ...pkgForm, purchase_unit: e.target.value })} /></div>
              <div className="form-group"><label>Units / Purchase Unit</label><input type="number" className="form-control" value={pkgForm.units_per_purchase_unit} onChange={(e) => setPkgForm({ ...pkgForm, units_per_purchase_unit: Number(e.target.value) })} /></div>
              <div className="form-group full-width"><label>Notes</label><textarea className="form-control" rows={2} value={pkgForm.notes} onChange={(e) => setPkgForm({ ...pkgForm, notes: e.target.value })} /></div>
            </div>
          )}
          <div className="form-actions"><button className="btn btn-primary" onClick={handleSave}>Save</button></div>
        </Modal>
      )}
    </div>
  );
}
