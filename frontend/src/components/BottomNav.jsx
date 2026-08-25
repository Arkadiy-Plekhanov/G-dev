import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const ITEMS = [
  { to: '/', key: 'home', end: true },
  { to: '/log', key: 'actions' },
  { to: '/goals', key: 'goals' },
  { to: '/qualities', key: 'qualities' },
  { to: '/profile', key: 'profile' },
]

export default function BottomNav() {
  const { t } = useTranslation()
  return (
    <nav className="bottom-nav">
      {ITEMS.map((item) => (
        <NavLink key={item.key} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          {t(`nav.${item.key}`)}
        </NavLink>
      ))}
    </nav>
  )
}
