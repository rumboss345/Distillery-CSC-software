import { useEffect, useState } from 'react';
import { RETURN_DISPOSITIONS } from '../../../shared/sales/constants';
import { salesRepository } from '../../db/repositories/sales-repository';
import type { SalReturn, SalShipment } from '../../types/sales';

export function ReturnsPage() {
  const [returns, setReturns] = useState<SalReturn[]>([]);
  const [shipments, setShipments] = useState<SalShipment[]>([]);
  const [shipmentId, setShipmentId] = useState<number | ''>('');
  const [disposition, setDisposition] = useState<(typeof RETURN_DISPOSITIONS)[number]>('Return to Stock');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState('');

  const refresh = () => {
    setReturns(salesRepository.listReturns());
    setShipments(salesRepository.listShipments({ status: 'Posted' }));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = () => {
    setError('');
    try {
      if (!shipmentId) throw new Error('Select a posted shipment.');
      const shipment = salesRepository.getShipment(Number(shipmentId));
      if (!shipment) throw new Error('Shipment not found.');
      const shipLines = salesRepository.getShipmentLines(Number(shipmentId));
      if (shipLines.length === 0) throw new Error('Shipment has no lines.');

      const returnId = salesRepository.createReturn({
        shipmentId: Number(shipmentId),
        customerId: shipment.customer_id,
        returnDate: new Date().toISOString().slice(0, 10),
      });
      const line = shipLines[0];
      salesRepository.addReturnLine({
        returnId,
        shipmentLineId: line.id,
        fgLotId: line.fg_lot_id,
        skuId: line.sku_id,
        quantity: Number(qty),
        disposition,
        destinationLocationId: line.source_location_id,
      });
      salesRepository.postReturn(returnId);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process return.');
    }
  };

  return (
    <>
      <section className="card">
        <h2>Process Return</h2>
        {error && <p className="form-error">{error}</p>}
        <div className="form-row">
          <label>
            Posted Shipment
            <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select…</option>
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>{s.shipment_code}</option>
              ))}
            </select>
          </label>
          <label>
            Disposition
            <select value={disposition} onChange={(e) => setDisposition(e.target.value as typeof disposition)}>
              {RETURN_DISPOSITIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            Qty
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" onClick={handleCreate}>
            Post Return
          </button>
        </div>
      </section>
      <table className="data-table">
        <thead>
          <tr>
            <th>Return</th>
            <th>Shipment</th>
            <th>Date</th>
            <th>Status</th>
            <th>Posted</th>
          </tr>
        </thead>
        <tbody>
          {returns.map((r) => {
            const shipment = shipments.find((s) => s.id === r.shipment_id);
            return (
              <tr key={r.id}>
                <td>{r.return_code}</td>
                <td>{shipment?.shipment_code ?? '—'}</td>
                <td>{r.return_date}</td>
                <td>{r.status}</td>
                <td>{r.posted_at ? r.posted_at.slice(0, 16) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
