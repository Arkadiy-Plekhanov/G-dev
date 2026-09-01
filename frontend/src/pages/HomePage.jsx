import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { analyticsApi, actionsApi } from '../api/resources'
import { growthStage } from '../lib/growthStage'
import { TREND_ARROW, TREND_CLASS } from '../lib/displayMaps'
import { CenterLoading, ErrorBanner } from '../components/Feedback'
import { useAuth } from '../auth/AuthContext'


/** §4.3: "одно предложение-вывод вместо списка цифр... в Фазе 1 --
 * простейшее правило по имеющимся данным". Приоритет: сначала хорошая
 * новость (что-то растёт), потом то, что стоит заметить (что-то падает),
 * иначе -- нейтральное "стабильно", иначе -- честно: данных пока мало.
 * Полноценные рекомендации (несколько сигналов, приоритизация) -- Фаза 2. */
function pickInsight(focus) {
  const withData = focus.filter((q) => q.trend && q.trend !== 'insufficient_data')
  if (withData.length === 0) return { key: 'home.focusInsightNone' }
  const rising = withData.find((q) => q.trend === 'rising')
  if (rising) return { key: 'home.focusInsightRising', name: rising.name.en }
  const declining = withData.find((q) => q.trend === 'declining')
  if (declining) return { key: 'home.focusInsightDeclining', name: declining.name.en }
  return { key: 'home.focusInsightSteady', name: withData[0].name.en }
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

      <Link to="/log" className="btn btn-primary" style={{ marginBottom: 12 }}>
        {t('home.logAction')}
      </Link>
      <Link to="/reflections/new" className="btn btn-secondary" style={{ marginBottom: 24, textAlign: 'center' }}>
        {t('home.reflectPrompt')}
      </Link>

      <ErrorBanner error={error} />

      <h2>{t('home.focusQualities')}</h2>
      {!focus && !error && <CenterLoading />}
      {focus && focus.length === 0 && <p className="empty-state">{t('home.noFocus')}</p>}

      {focus && focus.length > 0 && (
        <p style={{ color: 'var(--ink-soft)', marginTop: -4 }}>
          {t(pickInsight(focus).key, { name: pickInsight(focus).name })}
        </p>
      )}

      {focus && focus.map((q) => (
        <Link key={q.id} to={`/qualities/${q.id}`} className="card card--tappable card-link">
          <div className="stat-row-name">{q.name.en}</div>
          <div className={`stat-row-details ${TREND_CLASS[q.trend] || 'trend-flat'}`}>
            <span>{t(`stats.stage.${growthStage(q) ?? 'none'}`)}</span>
            {q.avg_score_all_time != null && (
              <span className="eyebrow">{Number(q.avg_score_all_time).toFixed(1)}</span>
            )}
            {TREND_ARROW[q.trend] && <span>{TREND_ARROW[q.trend]}</span>}
          </div>
        </Link>
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 24 }}>
        <h2 style={{ margin: 0 }}>{t('home.recentActions')}</h2>
        <Link to="/actions" style={{ fontSize: '0.85rem' }}>{t('actionsHistory.seeAll')}</Link>
      </div>
      {recent && recent.length === 0 && <p className="empty-state">{t('home.noActions')}</p>}
      {recent && recent.map((a) => (
        <Link key={a.id} to={`/actions/${a.id}`} className="card card--tappable card-link">
          <div>{a.name}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>{a.occurred_at}</div>
        </Link>
      ))}
    </div>
  )
}
