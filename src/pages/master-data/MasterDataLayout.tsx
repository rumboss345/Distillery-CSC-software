import { NavLink, Outlet } from 'react-router-dom';

const subNav = [
  { to: '/master-data/products', label: 'Products' },
  { to: '/master-data/skus', label: 'SKUs' },
  { to: '/master-data/materials', label: 'Materials' },
  { to: '/master-data/bulk-spirits', label: 'Bulk Spirits' },
  { to: '/master-data/suppliers', label: 'Suppliers' },
  { to: '/master-data/locations', label: 'Locations' },
];

export function MasterDataLayout() {
  return (
    <div>
      <div className="page-header">
        <h2>Master Data</h2>
        <p>Products, materials, suppliers, and storage locations for future ERP modules</p>
      </div>
      <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {subNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `btn btn-sm${isActive ? ' btn-primary' : ' btn-secondary'}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
