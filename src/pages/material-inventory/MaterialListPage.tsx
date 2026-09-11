import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ActivateLedgerDialog, PostActivationBanner } from '../../components/material-inventory/ActivateLedgerDialog';
import { masterDataRepository, materialInventoryRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';
import { buildMaterialLedgerDisplay, materialTypeForKind } from '../../../shared/material-inventory/ledger-activation-ui';
import type { MdPackagingMaterial, MdRawMaterial } from '../../types/master-data';

type Props = { materialKind: 'raw' | 'packaging' };

type RowItem = MdRawMaterial | MdPackagingMaterial;

export function MaterialListPage({ materialKind }: Props) {
  const { key, refresh } = useRefreshKey();
  const [activateTarget, setActivateTarget] = useState<RowItem | null>(null);
  const [justActivated, setJustActivated] = useState<string | null>(null);

  void key;
  const items = materialKind === 'raw'
    ? masterDataRepository.rawMaterials.list()
    : masterDataRepository.packagingMaterials.list();
  const materialType = materialTypeForKind(materialKind);

  const codeOf = (item: RowItem) =>
    materialKind === 'raw'
      ? (item as MdRawMaterial).material_code
      : (item as MdPackagingMaterial).packaging_code;

  const handleActivate = (reference: string) => {
    if (!activateTarget) return;
    materialInventoryRepository.tracking.activateLedger(materialType, activateTarget.id, reference);
    setJustActivated(activateTarget.name);
    setActivateTarget(null);
    refresh();
  };

  return (
    <section className="card">
      <h2>{materialKind === 'raw' ? 'Raw Materials' : 'Packaging Materials'}</h2>
      <p className="text-muted">
        LEGACY materials use legacy on-hand tracking. LEDGER materials use posted material transactions only.
      </p>
      {justActivated && (
        <PostActivationBanner materialName={justActivated} onDismiss={() => setJustActivated(null)} />
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Tracking</th>
            <th>Inventory UOM</th>
            <th>Ledger Balance</th>
            <th>Activation</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const info = materialInventoryRepository.tracking.getLedgerInfo(materialType, item.id);
            const display = buildMaterialLedgerDisplay({
              trackingMode: info.trackingMode,
              onHand: info.onHand,
              ledgerActivatedAt: info.ledgerActivatedAt,
              ledgerActivationReference: info.ledgerActivationReference,
              hasLedgerTransactions: info.hasLedgerTransactions,
            });
            return (
              <tr key={item.id}>
                <td>{codeOf(item)}</td>
                <td>{item.name}</td>
                <td><strong>{display.trackingLabel}</strong></td>
                <td>{item.inventory_unit}</td>
                <td>{display.ledgerBalanceLabel}</td>
                <td>
                  {display.trackingLabel === 'LEDGER' ? (
                    <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                      {display.activatedAtLabel && <div>Activated: {display.activatedAtLabel}</div>}
                      {display.activationReference && <div>Ref: {display.activationReference}</div>}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {display.showActivateAction && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => setActivateTarget(item)}
                    >
                      Activate Ledger Tracking
                    </button>
                  )}
                  {display.trackingLabel === 'LEDGER' && (
                    <Link to="/material-inventory/opening-balance" className="btn btn-sm btn-secondary" style={{ marginLeft: display.showActivateAction ? 0 : undefined }}>
                      Opening Balance
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {activateTarget && (
        <ActivateLedgerDialog
          materialName={activateTarget.name}
          onClose={() => setActivateTarget(null)}
          onConfirm={handleActivate}
        />
      )}
    </section>
  );
}
