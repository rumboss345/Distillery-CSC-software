import { masterDataRepository, materialInventoryRepository } from '../../db/repositories';

type Props = { materialKind: 'raw' | 'packaging' };

export function MaterialListPage({ materialKind }: Props) {
  const items = materialKind === 'raw'
    ? masterDataRepository.rawMaterials.list()
    : masterDataRepository.packagingMaterials.list();

  return (
    <section className="card">
      <h2>{materialKind === 'raw' ? 'Raw Materials' : 'Packaging Materials'}</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Tracking</th>
            <th>Inventory UOM</th>
            <th>On Hand (LEDGER)</th>
            <th>Reorder Point</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const mode = (item as { inventory_tracking_mode?: string }).inventory_tracking_mode ?? 'LEGACY';
            const isRaw = materialKind === 'raw';
            const onHand = mode === 'LEDGER'
              ? materialInventoryRepository.balance.getMaterialBalance(
                  isRaw ? 'RAW_MATERIAL' : 'PACKAGING_MATERIAL',
                  isRaw ? item.id : null,
                  isRaw ? null : item.id,
                ).onHand
              : null;
            return (
              <tr key={item.id}>
                <td>{isRaw ? (item as { material_code: string }).material_code : (item as { packaging_code: string }).packaging_code}</td>
                <td>{item.name}</td>
                <td>{mode}</td>
                <td>{isRaw ? (item as { inventory_unit: string }).inventory_unit : (item as { inventory_unit: string }).inventory_unit}</td>
                <td>{onHand != null ? onHand.toFixed(3) : '— (LEGACY)'}</td>
                <td>{(item as { reorder_point?: number }).reorder_point ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
