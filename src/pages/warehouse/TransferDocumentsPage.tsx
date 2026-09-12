import { useMemo, useState } from 'react';
import {
  createTransferDocument,
  getTransferLines,
  listTransferDocuments,
  receiveTransferDocument,
  releaseTransferDocument,
} from '../../db/multi-location-queries';
import { queryAll } from '../../db/database';

export function TransferDocumentsPage() {
  const [refresh, setRefresh] = useState(0);
  const transfers = useMemo(() => listTransferDocuments(), [refresh]);
  const locations = useMemo(
    () => queryAll<{ id: number; location_code: string; name: string }>(
      'SELECT id, location_code, name FROM md_storage_locations WHERE active = 1 ORDER BY name',
    ),
    [refresh],
  );

  const handleCreate = () => {
    if (locations.length < 2) return;
    createTransferDocument({
      originLocationId: locations[0].id,
      destinationLocationId: locations[1].id,
      lines: [],
    });
    setRefresh((r) => r + 1);
  };

  return (
    <div>
      <div className="page-actions">
        <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={locations.length < 2}>
          New Transfer (Draft)
        </button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Status</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Ship</th>
            <th>Receive</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((doc) => {
            const origin = locations.find((l) => l.id === doc.origin_location_id);
            const dest = locations.find((l) => l.id === doc.destination_location_id);
            const lines = getTransferLines(doc.id);
            return (
              <tr key={doc.id}>
                <td>{doc.transfer_code}</td>
                <td>{doc.status}</td>
                <td>{origin?.name ?? doc.origin_location_id}</td>
                <td>{dest?.name ?? doc.destination_location_id}</td>
                <td>{doc.ship_date?.slice(0, 10) ?? '—'}</td>
                <td>{doc.receive_date?.slice(0, 10) ?? '—'}</td>
                <td>
                  {doc.status === 'Draft' && lines.length > 0 && (
                    <button type="button" className="btn btn-sm" onClick={() => { releaseTransferDocument(doc.id); setRefresh((r) => r + 1); }}>
                      Release
                    </button>
                  )}
                  {doc.status === 'In Transit' && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        receiveTransferDocument(
                          doc.id,
                          lines.map((l) => ({ lineId: l.id, quantity: l.quantity - l.received_quantity })),
                        );
                        setRefresh((r) => r + 1);
                      }}
                    >
                      Receive All
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
