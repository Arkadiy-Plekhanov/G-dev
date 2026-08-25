import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { analyticsApi, actionsApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'
import { useAuth } from '../auth/AuthContext'

function trendClass(trend) {
  if (trend?.includes('Growing') || trend === '↑') return 'trend-up'
  if (trend?.includes('Declining') || trend === '↓') return 'trend-down'
  return 'trend-flat'
}

export default function HomePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [focus, setFocus] = useState(null)
  const [recent, setRecent] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([analyticsApi.currentFocus(), actionsApi.list({ limit: 5 })])
      .then(([f, r]) => { setFocus(f); setRecent(r) })
      .catch(setError)
  }, [])

  return (
    <div className="screen">
      <div className="eyebrow">{t('home.greeting')}</div>
      <h1>{user?.display_name || ''}</h1>

      <Link to="/log" className="btn btn-primary" style={{ textDecoration: 'none', marginBottom: 24 }}>
        {t('home.logAction')}
      </Link>

      <ErrorBanner error={error} />

      <h2>{t('home.focusQualities')}</h2>
      {!focus && !error && <CenterLoading />}
      {focus && focus.length === 0 && <p className="empty-state">{t('home.noFocus')}</p>}
      {focus && focus.map((q) => (
        <Link key={q.id} to={`/qualities/${q.id}`} className="card card--tappable" style={{ display: 'flex', justifyContent: 'space-between', textDecoration: 'none', color: 'inherit' }}>
          <span>{q.name.en}</span>
          <span className={trendClass(q.trend)}>{q.avg_score_all_time != null ? Number(q.avg_score_all_time).toFixed(1) : '—'}</span>
        </Link>
      ))}

      <h2 style={{ marginTop: 24 }}>{t('home.recentActions')}</h2>
      {recent && recent.length === 0 && <p className="empty-state">{t('home.noActions')}</p>}
      {recent && recent.map((a) => (
        <div key={a.id} className="card">
          <div>{a.name}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>{a.occurred_at}</div>
        </div>
      ))}
    </div>
  )
}
