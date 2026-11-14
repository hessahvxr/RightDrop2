import { NavLink, Outlet } from 'react-router-dom'
import {
  CalendarDays,
  Home,
  ScanLine,
  UserCircle,
  MessageCircle,
} from 'lucide-react'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/patient', label: 'اليوم', icon: Home, end: true },
  { to: '/patient/assistant', label: 'المساعد', icon: MessageCircle, end: false },
  { to: '/patient/scan', label: 'تصوير الدواء', icon: ScanLine, end: false },
  { to: '/patient/schedule', label: 'الجدول', icon: CalendarDays, end: false },
  { to: '/patient/profile', label: 'حسابي', icon: UserCircle, end: false },
]

export default function PatientLayout() {
  const { profile } = useAuth()
  const displayName = profile?.full_name || 'مرحباً بك'

  const formattedDate = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="min-h-screen bg-sand-50/80 text-slate-800">
      {/* Calm, accessible top header */}
      <header className="sticky top-0 z-30 border-b border-sand-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5">
          <Logo size="sm" />
          <div className="text-left">
            <p className="text-base font-bold text-slate-900 leading-tight">{displayName}</p>
            <p className="text-xs font-medium text-slate-500">{formattedDate}</p>
          </div>
        </div>
      </header>

      {/* Main content container with comfortable padding */}
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">
        <Outlet />
      </main>

      {/* Primary bottom navigation with large touch targets */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-200 bg-white/95 backdrop-blur-md shadow-lg shadow-sand-300/20"
        aria-label="التنقل الرئيسي"
      >
        <div className="mx-auto flex max-w-2xl items-stretch justify-around px-2 py-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-2.5 transition-all ${
                  isActive
                    ? 'bg-sage-100/70 text-sage-800 font-bold shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 active:bg-sand-100'
                }`
              }
            >
              <item.icon size={26} strokeWidth={2.2} />
              <span className="text-xs sm:text-sm font-semibold tracking-tight">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
