import { useMemo } from 'react';
import { getLocationHierarchy } from '../../db/multi-location-queries';

function renderNode(node: ReturnType<typeof getLocationHierarchy>[0], depth = 0): JSX.Element {
  return (
    <div key={node.id} style={{ marginLeft: depth * 16 }}>
      <strong>{node.location_code}</strong> — {node.name}
      {node.hierarchy_level && <span className="text-muted"> ({node.hierarchy_level})</span>}
      {node.children.map((child) => renderNode(child, depth + 1))}
    </div>
  );
}

export function LocationHierarchyPage() {
  const hierarchy = useMemo(() => getLocationHierarchy(), []);
  return (
    <div>
      <p className="page-subtitle">Location hierarchy: Site → Warehouse → Room → Zone → Aisle → Rack → Bin</p>
      {hierarchy.map((node) => renderNode(node))}
    </div>
  );
}
