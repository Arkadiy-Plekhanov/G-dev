import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { goalsApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

const baselineLabel = { above_usual: 'goals.aboveUsual', below_usual: 'goals.belowUsual', as_usual: 'goals.asUsual' }

export default function GoalDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    goalsApi.overview(id).then(setData).catch(setError)
  }, [id])

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!data) return <CenterLoading />

  const { goal, recent_actions: recentActions, qualities } = data

  return (
    <div className="screen">
      <Link to="/goals" style={{ fontSize: '0.85rem' }}>← {t('goals.title')}</Link>
      <h1>{goal.name}</h1>
      {goal.description && <p>{goal.description}</p>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <span className="pill">{goal.status_code}</span>
        <span className="pill pill--gold">{goal.priority_code}</span>
        {goal.progress_pct != null && <span className="pill">{goal.progress_pct}%</span>}
      </div>

      <h2>{t('goals.overview')}</h2>
      <h3>{t('goals.recentActions')}</h3>
      {recentActions.length === 0 && <p className="empty-state">{t('home.noActions')}</p>}
      {recentActions.map((a) => (
        <div key={a.id} className="card">
          <div>{a.name}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>{a.occurred_at}{a.avg_score != null ? ` · ${Number(a.avg_score).toFixed(1)}` : ''}</div>
        </div>
      ))}

      <h3>{t('goals.qualitiesHere')}</h3>
      {qualities.length === 0 && <p className="empty-state">{t('home.noActions')}</p>}
      {qualities.map((q) => (
        <div key={q.catalog_quality_id} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{q.name.en}</span>
          <span>
            {Number(q.avg_in_goal).toFixed(1)}
            {q.vs_baseline && <span className="pill" style={{ marginLeft: 6 }}>{t(baselineLabel[q.vs_baseline])}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}
