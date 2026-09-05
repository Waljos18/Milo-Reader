import { NavLink, Outlet } from 'react-router-dom'
import { resolveTheme, useTheme } from '../context/theme-context'

const navItems = [
  {
    to: '/',
    label: 'Biblioteca',
    end: true,
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M9 3v18M15 3v18" />
      </>
    )
  },
  {
    to: '/catalog',
    label: 'Catálogo',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15.5 8.5 13 13l-4.5 2.5L11 11z" />
      </>
    )
  },
  {
    to: '/annotations',
    label: 'Anotaciones',
    icon: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
  },
  {
    to: '/stats',
    label: 'Estadísticas',
    icon: (
      <>
        <rect x="4" y="10" width="3.6" height="10" rx="1" />
        <rect x="10.2" y="4" width="3.6" height="16" rx="1" />
        <rect x="16.4" y="13" width="3.6" height="7" rx="1" />
      </>
    )
  },
  {
    to: '/settings',
    label: 'Ajustes',
    icon: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1M18.5 18.5l-2.1-2.1M7.6 7.6 5.5 5.5" />
      </>
    )
  }
]

export default function AppLayout(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const isDark = resolveTheme(theme) === 'dark'

  return (
    <div className="flex h-screen">
      <aside className="flex w-[272px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
        <div className="mb-7 flex items-center gap-2.5 px-2">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 6.5c-1.6-1.3-3.8-2-6.5-2-.6 0-1 .4-1 1v11c0 .6.4 1 1 1 2.7 0 4.9.7 6.5 2 1.6-1.3 3.8-2 6.5-2 .6 0 1-.4 1-1v-11c0-.6-.4-1-1-1-2.7 0-4.9.7-6.5 2z" />
            <path d="M12 6.5v13" />
          </svg>
          <div>
            <div className="font-serif text-[19px] font-semibold leading-none tracking-tight">
              MiloReader
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[.14em] text-[var(--color-text-faint)]">
              Perú
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent-hover)]'
                    : 'text-[var(--color-text-soft)] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-text)]'
                }`
              }
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                {item.icon}
              </svg>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg-soft)] px-3 py-2.5 text-[13px] font-medium text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
        >
          {isDark ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
          {isDark ? 'Tema oscuro' : 'Tema claro'}
        </button>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-11">
        <Outlet />
      </main>
    </div>
  )
}
