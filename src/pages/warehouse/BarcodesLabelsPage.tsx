import { useState } from 'react';
import { buildLabelData, generateBarcodeForEntity, lookupBarcode, registerBarcode } from '../../db/multi-location-queries';

export function BarcodesLabelsPage() {
  const [scanInput, setScanInput] = useState('');
  const [lookupResult, setLookupResult] = useState<string>('');

  const handleScan = () => {
    const record = lookupBarcode(scanInput);
    if (!record) {
      setLookupResult('Barcode not found.');
      return;
    }
    const label = buildLabelData(record.entity_type as 'fg_lot' | 'material_lot' | 'storage_location', record.entity_id);
    setLookupResult(
      label
        ? `${label.code} | ${label.description} | Lot: ${label.lot} | ${label.date} | ${label.barcode}`
        : `Found: ${record.entity_type} #${record.entity_id}`,
    );
  };

  return (
    <div>
      <section className="form-section">
        <h3>Barcode Scanner Input</h3>
        <p className="text-muted">Paste or scan barcode text (keyboard wedge compatible).</p>
        <div className="form-row">
          <input
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            placeholder="Scan barcode..."
          />
          <button type="button" className="btn btn-primary" onClick={handleScan}>Lookup</button>
        </div>
        {lookupResult && <p>{lookupResult}</p>}
      </section>
      <section className="form-section">
        <h3>Register Barcode</h3>
        <p className="text-muted">Generate system barcodes for lots, SKUs, and locations.</p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            try {
              registerBarcode({ barcode: `TEST-${Date.now()}`, entityType: 'storage_location', entityId: 1 });
              setLookupResult('Barcode registered.');
            } catch (err) {
              setLookupResult(String(err));
            }
          }}
        >
          Register Sample
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            const code = generateBarcodeForEntity({ entityType: 'sku', entityId: 1 });
            setLookupResult(`Generated: ${code}`);
          }}
        >
          Generate SKU Barcode
        </button>
      </section>
    </div>
  );
}
