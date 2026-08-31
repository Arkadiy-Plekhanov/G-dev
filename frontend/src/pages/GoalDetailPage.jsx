import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { goalsApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

const BASELINE = {
  above_usual: { key: 'goals.aboveUsual', trend: 'up' },
  below_usual: { key: 'goals.belowUsual', trend: 'down' },
  as_usual: { key: 'goals.asUsual', trend: 'flat' },
}

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
  // Самая содержательная метрика продукта (§4.2): проявляет ли эта цель
  // в тебе лучшее или худшее. Один явный вывод сверху, а не строка в
  // таблице -- above_usual важнее для человека, чем below_usual/as_usual,
  // поэтому если оно есть хотя бы у одного качества, оно и выводится.
  const withBaseline = qualities.filter((q) => q.vs_baseline)
  const headline = withBaseline.find((q) => q.vs_baseline === 'above_usual')
    || withBaseline.find((q) => q.vs_baseline === 'below_usual')
    || withBaseline[0]

  return (
    <div className="screen">
      <Link to="/goals" style={{ fontSize: '0.85rem' }}>← {t('goals.title')}</Link>
      <h1>{goal.name}</h1>
      {goal.description && <p>{goal.description}</p>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="pill">{goal.status_code}</span>
        <span className="pill pill--gold">{goal.priority_code}</span>
        {goal.progress_pct != null && <span className="pill">{goal.progress_pct}%</span>}
      </div>

      {headline && (
        <div className="card" style={{ borderLeft: `3px solid var(--${BASELINE[headline.vs_baseline].trend === 'up' ? 'growth' : BASELINE[headline.vs_baseline].trend === 'down' ? 'brick' : 'line'})` }}>
          <div className="eyebrow">{headline.name.en}</div>
          <div style={{ fontSize: '1.05rem', marginTop: 2 }}>
            <span className={`trend-${BASELINE[headline.vs_baseline].trend}`} style={{ marginRight: 6 }}>
              {BASELINE[headline.vs_baseline].trend === 'up' ? '↗' : BASELINE[headline.vs_baseline].trend === 'down' ? '↘' : '→'}
            </span>
            {t(BASELINE[headline.vs_baseline].key)}
          </div>
        </div>
      )}

      <h3>{t('goals.recentActions')}</h3>
      {recentActions.length === 0 && <p className="empty-state">{t('home.noActions')}</p>}
      {recentActions.map((a) => (
        <div key={a.id} className="card">
          <div>{a.name}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>{a.occurred_at}{a.avg_score != null ? ` · ${Number(a.avg_score).toFixed(1)}` : ''}</div>
        </div>
      ))}

      {qualities.length > 0 && (
        <>
          <h3>{t('goals.qualitiesHere')}</h3>
          {qualities.map((q) => (
            <div key={q.catalog_quality_id} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{q.name.en}</span>
              <span>
                {Number(q.avg_in_goal).toFixed(1)}
                {/* Качество-заголовок уже показало этот же вывод крупно
                    выше -- повторять здесь ту же самую метку для него же
                    было бы избыточно на экране, не только для теста. */}
                {q.vs_baseline && q.catalog_quality_id !== headline?.catalog_quality_id && (
                  <span className={`pill${q.vs_baseline === 'below_usual' ? ' pill--brick' : q.vs_baseline === 'above_usual' ? ' pill--gold' : ''}`} style={{ marginLeft: 6 }}>
                    {t(BASELINE[q.vs_baseline].key)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </>
      )}

      <Link to={`/reflections/new?goal_id=${goal.id}`} className="btn btn-secondary" style={{ display: 'block', textAlign: 'center', marginTop: 16 }}>
        {t('reflections.aboutGoal')}
      </Link>
    </div>
  )
}
