import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/mash', label: 'Mash & Ferment', icon: '◉' },
  { to: '/distillation', label: 'Distillation', icon: '△' },
  { to: '/blending', label: 'Blending', icon: '◆' },
  { to: '/barrels', label: 'Barrel Aging', icon: '▣' },
  { to: '/bottling', label: 'Bottling', icon: '◇' },
  { to: '/floor-plan', label: 'Floor Plan', icon: '▦' },
  { to: '/inventory', label: 'Inventory', icon: '☰' },
  { to: '/reports', label: 'Reports', icon: '▤' },
];

export function Layout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>CSC Distillery Tracker</h1>
          <p>Production management</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
