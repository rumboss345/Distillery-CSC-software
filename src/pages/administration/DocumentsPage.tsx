import { useEffect, useState } from 'react';
import { administrationRepository } from '../../db/repositories/administration-repository';
import type { AdmDocument } from '../../types/administration';

export function DocumentsPage() {
  const [documents, setDocuments] = useState<AdmDocument[]>([]);
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('COA');
  const [fileName, setFileName] = useState('');
  const [storageUri, setStorageUri] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [error, setError] = useState('');

  const refresh = () => setDocuments(administrationRepository.listDocuments());

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = () => {
    setError('');
    try {
      administrationRepository.createDocument({
        title: title.trim(),
        documentType: documentType.trim(),
        fileName: fileName.trim(),
        storageUri: storageUri.trim(),
        entityType: entityType.trim() || null,
        entityId: entityId.trim() || null,
        mimeType: fileName.endsWith('.pdf') ? 'application/pdf' : null,
        fileSizeBytes: null,
      });
      setTitle('');
      setFileName('');
      setStorageUri('');
      setEntityType('');
      setEntityId('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to register document.');
    }
  };

  const handleDeactivate = (id: number) => {
    setError('');
    try {
      administrationRepository.deactivateDocument(id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deactivate document.');
    }
  };

  return (
    <section className="card">
      <h2>Document Metadata</h2>
      <p className="text-muted">
        Register document references only — file bytes stay outside operational tables (storage URI / external path).
      </p>
      {error && <p className="form-error">{error}</p>}

      <div className="form-row">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <input value={documentType} onChange={(e) => setDocumentType(e.target.value)} placeholder="Type (COA, SOP…)" />
        <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="File name" />
        <input value={storageUri} onChange={(e) => setStorageUri(e.target.value)} placeholder="Storage URI / path" />
      </div>
      <div className="form-row">
        <input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="Entity type (optional)" />
        <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="Entity ID (optional)" />
        <button type="button" className="btn btn-primary" onClick={handleCreate}>Register Document</button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Title</th>
            <th>Type</th>
            <th>File</th>
            <th>Entity</th>
            <th>Storage URI</th>
            <th>Uploaded</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.document_code}</td>
              <td>{doc.title}</td>
              <td>{doc.document_type}</td>
              <td>{doc.file_name}</td>
              <td>{doc.entity_type ? `${doc.entity_type} #${doc.entity_id}` : '—'}</td>
              <td><code>{doc.storage_uri}</code></td>
              <td>{doc.uploaded_at.slice(0, 10)}</td>
              <td>
                <button type="button" className="btn btn-sm" onClick={() => handleDeactivate(doc.id)}>
                  Deactivate
                </button>
              </td>
            </tr>
          ))}
          {documents.length === 0 && (
            <tr>
              <td colSpan={8} className="text-muted">No documents registered.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
