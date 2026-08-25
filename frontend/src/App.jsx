import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { qualitiesApi } from './api/resources'
import { CenterLoading } from './components/Feedback'
import BottomNav from './components/BottomNav'

import LoginPage from './pages/LoginPage'
import ChoosePathPage from './pages/onboarding/ChoosePathPage'
import IdealPage from './pages/onboarding/IdealPage'
import ManualPage from './pages/onboarding/ManualPage'
import HomePage from './pages/HomePage'
import LogActionPage from './pages/LogActionPage'
import GoalsListPage from './pages/GoalsListPage'
import GoalDetailPage from './pages/GoalDetailPage'
import QualitiesListPage from './pages/QualitiesListPage'
import QualityDetailPage from './pages/QualityDetailPage'
import ProfilePage from './pages/ProfilePage'

function AuthGate({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <CenterLoading />
  if (!user) return <LoginPage />
  return children
}

/** Пользователь без единого принятого качества направляется на онбординг --
 * ровно тот момент, когда все три равноценных пути реально нужны. Проверка
 * лёгкая (один список качеств), не блокирует остальную навигацию, если он
 * уже внутри /onboarding. */
function OnboardingGate({ children }) {
  const location = useLocation()
  const [hasQualities, setHasQualities] = useState(null)

  useEffect(() => {
    qualitiesApi.list().then((q) => setHasQualities(q.length > 0)).catch(() => setHasQualities(true))
  }, [])

  if (hasQualities === null) return <CenterLoading />
  if (!hasQualities && !location.pathname.startsWith('/onboarding')) {
    return <Navigate to="/onboarding" replace />
  }
  return children
}

function Layout({ children }) {
  const location = useLocation()
  const isOnboarding = location.pathname.startsWith('/onboarding')
  return (
    <div className="app-shell">
      {children}
      {!isOnboarding && <BottomNav />}
    </div>
  )
}

function AuthedApp() {
  return (
    <OnboardingGate>
      <Layout>
        <Routes>
          <Route path="/onboarding" element={<ChoosePathPage />} />
          <Route path="/onboarding/ideal" element={<IdealPage />} />
          <Route path="/onboarding/manual" element={<ManualPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/log" element={<LogActionPage />} />
          <Route path="/goals" element={<GoalsListPage />} />
          <Route path="/goals/:id" element={<GoalDetailPage />} />
          <Route path="/qualities" element={<QualitiesListPage />} />
          <Route path="/qualities/:id" element={<QualityDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </OnboardingGate>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate>
          <AuthedApp />
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  )
}
