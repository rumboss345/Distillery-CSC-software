import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MATERIAL_INVENTORY_PENDING_MESSAGE } from '../../../shared/production-orders/constants';
import { liquidInventoryRepository, productionOrdersRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';

export function BatchExecutionPage() {
  const { id, batchId } = useParams();
  const orderId = Number(id);
  const bid = Number(batchId);
  const navigate = useNavigate();
  const { key, refresh } = useRefreshKey();
  const [error, setError] = useState('');
  const [destTankId, setDestTankId] = useState(0);
  const [outputLitres, setOutputLitres] = useState(0);
  const [outputAbv, setOutputAbv] = useState(40);

  void key;
  const order = productionOrdersRepository.getOrder(orderId);
  const batch = productionOrdersRepository.getBatch(bid);
  const requirements = productionOrdersRepository.getRequirements(orderId);
  const steps = productionOrdersRepository.getBatchSteps(bid);
  const plannedVsActual = productionOrdersRepository.getPlannedVsActual(bid);
  const tanks = liquidInventoryRepository.tanks.listTanks().filter((t) => t.tracking_mode === 'LEDGER');
  const tankLots = destTankId ? liquidInventoryRepository.tanks.getTankLotComponents(destTankId) : [];

  if (!order || !batch) return <p>Batch not found.</p>;

  const recordLiquid = (reqId: number, lotId: number, tankId: number, vol: number, abv: number) => {
    try {
      productionOrdersRepository.recordInput({
        batchId: bid,
        requirementId: reqId,
        inputType: 'Liquid Lot',
        liquidLotId: lotId,
        sourceTankId: tankId,
        actualQuantity: vol,
        unit: 'L',
        actualVolumeLitres: vol,
        actualAbv: abv,
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Record failed');
    }
  };

  const recordWater = (reqId: number, vol: number) => {
    try {
      productionOrdersRepository.recordInput({
        batchId: bid,
        requirementId: reqId,
        inputType: 'Water',
        actualQuantity: vol,
        unit: 'L',
        actualVolumeLitres: vol,
        actualAbv: 0,
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Record failed');
    }
  };

  const recordRaw = (reqId: number, qty: number, unit: string) => {
    try {
      productionOrdersRepository.recordInput({
        batchId: bid,
        requirementId: reqId,
        inputType: 'Raw Material',
        actualQuantity: qty,
        unit,
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Record failed');
    }
  };

  const handleComplete = () => {
    try {
      productionOrdersRepository.completeBatch({
        batchId: bid,
        destinationTankId: destTankId,
        actualOutputLitres: outputLitres,
        actualOutputAbv: outputAbv,
        outputDescription: `${order.product_name} — ${batch.batch_code}`,
      });
      refresh();
      navigate(`/production/${orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Completion failed');
    }
  };

  const spiritReq = requirements.find((r) => r.requirement_type === 'Bulk Spirit');
  const waterReq = requirements.find((r) => r.requirement_type === 'Water');

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <Link to={`/production/${orderId}`}>← {order.order_code}</Link>
        <span style={{ marginLeft: '1rem' }}><strong>{batch.batch_code}</strong> — {order.production_type}</span>
      </div>
      {error && <p className="alert alert-error">{error}</p>}

      <section style={{ marginBottom: '1.5rem' }}>
        <h3>A. Planned Inputs</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Description</th><th>Planned</th><th>Unit</th></tr></thead>
            <tbody>
              {requirements.map((r) => (
                <tr key={r.id}><td>{r.description}</td><td>{r.planned_quantity}</td><td>{r.unit}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h3>B–D. Record Actual Inputs</h3>
        <p className="alert alert-info">{MATERIAL_INVENTORY_PENDING_MESSAGE}</p>
        {spiritReq && tanks[0] && tankLots[0] && (
          <button className="btn btn-secondary" onClick={() => recordLiquid(spiritReq.id, tankLots[0]!.lotId, tanks[0]!.id, 1000, 96)}>
            Record spirit (example 1000 L @ 96%)
          </button>
        )}
        {waterReq && (
          <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => recordWater(waterReq.id, 1400)}>
            Record water (example 1400 L)
          </button>
        )}
        {requirements.filter((r) => r.requirement_type === 'Raw Material').map((r) => (
          <button key={r.id} className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => recordRaw(r.id, r.planned_quantity, r.unit)}>
            Record {r.description}
          </button>
        ))}
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h3>E. Process Steps</h3>
        <ol>{steps.map((s) => <li key={s.id}><strong>{s.status}</strong> Step {s.step_number}: {s.instruction_snapshot}</li>)}</ol>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h3>H. Variance Summary</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Planned</th><th>Actual</th><th>Variance</th></tr></thead>
            <tbody>
              {plannedVsActual.map((l, i) => (
                <tr key={i}><td>{l.description}</td><td>{l.plannedQuantity}</td><td>{l.actualQuantity}</td><td>{l.variance.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h3>G. Output & I. Complete Batch</h3>
        <label>Destination tank</label>
        <select className="form-control" value={destTankId} onChange={(e) => setDestTankId(Number(e.target.value))}>
          <option value={0}>Select tank…</option>
          {tanks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label>Actual output litres</label>
        <input className="form-control" type="number" value={outputLitres} onChange={(e) => setOutputLitres(Number(e.target.value))} />
        <label>Actual output ABV (%)</label>
        <input className="form-control" type="number" value={outputAbv} onChange={(e) => setOutputAbv(Number(e.target.value))} />
        {batch.status === 'In Progress' && (
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={handleComplete} disabled={!destTankId || outputLitres <= 0}>
            Complete Batch
          </button>
        )}
      </section>
    </div>
  );
}
