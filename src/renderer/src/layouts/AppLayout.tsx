import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Biblioteca', end: true },
  { to: '/annotations', label: 'Anotaciones' },
  { to: '/stats', label: 'Estadisticas' },
  { to: '/settings', label: 'Ajustes' }
]

export default function AppLayout(): React.JSX.Element {
  return (
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-soft)] p-4">
        <h1 className="mb-6 px-2 text-lg font-semibold">MiloReader</h1>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-[var(--color-text-soft)] hover:bg-[var(--color-bg-mute)]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
