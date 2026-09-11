import { useMemo } from 'react';
import { masterDataRepository, materialInventoryRepository } from '../../db/repositories';

export function MaterialDashboardPage() {
  const rawMaterials = masterDataRepository.rawMaterials.list();
  const packaging = masterDataRepository.packagingMaterials.list();

  const ledgerMaterials = useMemo(() => {
    const rows: Array<{ code: string; name: string; type: string; baseUnit: string; onHand: number }> = [];
    for (const rm of rawMaterials) {
      if ((rm as { inventory_tracking_mode?: string }).inventory_tracking_mode !== 'LEDGER') continue;
      const bal = materialInventoryRepository.balance.getMaterialBalance('RAW_MATERIAL', rm.id, null);
      rows.push({ code: rm.material_code, name: rm.name, type: 'Raw Material', baseUnit: bal.baseUnit, onHand: bal.onHand });
    }
    for (const pm of packaging) {
      if ((pm as { inventory_tracking_mode?: string }).inventory_tracking_mode !== 'LEDGER') continue;
      const bal = materialInventoryRepository.balance.getMaterialBalance('PACKAGING_MATERIAL', null, pm.id);
      rows.push({ code: pm.packaging_code, name: pm.name, type: 'Packaging', baseUnit: bal.baseUnit, onHand: bal.onHand });
    }
    return rows;
  }, [rawMaterials, packaging]);

  return (
    <section className="card">
      <h2>LEDGER-Managed Materials</h2>
      <p className="text-muted">On-hand quantities are derived from posted material transactions only. LEGACY inventory is shown separately under Inventory.</p>
      {ledgerMaterials.length === 0 ? (
        <p>No LEDGER-managed materials yet. Enable LEDGER tracking on master data and post a receipt.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Material</th>
              <th>Type</th>
              <th>On Hand</th>
              <th>Base UOM</th>
            </tr>
          </thead>
          <tbody>
            {ledgerMaterials.map((m) => (
              <tr key={`${m.type}-${m.code}`}>
                <td>{m.code}</td>
                <td>{m.name}</td>
                <td>{m.type}</td>
                <td>{m.onHand.toFixed(3)}</td>
                <td>{m.baseUnit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
