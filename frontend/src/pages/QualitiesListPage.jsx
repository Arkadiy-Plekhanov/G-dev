import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { growthStage } from '../lib/growthStage'
import { Link } from 'react-router-dom'
import { qualitiesApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

export default function QualitiesListPage() {
  const { t } = useTranslation()
  const [qualities, setQualities] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    qualitiesApi.list().then(setQualities).catch(setError)
  }, [])

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!qualities) return <CenterLoading />

  return (
    <div className="screen">
      <h1>{t('qualities.title')}</h1>
      {qualities.length === 0 && <p className="empty-state">{t('qualities.empty')}</p>}
      {qualities.map((q) => (
        <Link key={q.id} to={`/qualities/${q.id}`} className="card card--tappable"
              style={{ display: 'flex', justifyContent: 'space-between', textDecoration: 'none', color: 'inherit' }}>
          <div>
            <div>{q.name.en}</div>
            <span className="eyebrow">
              {t(`stats.stage.${growthStage(q) ?? 'none'}`)}
              {q.focus_code === 'current_focus' ? ` · ${t('qualities.inFocus')}` : ''}
            </span>
          </div>
          <span>{q.avg_score_all_time != null ? Number(q.avg_score_all_time).toFixed(1) : '—'}</span>
        </Link>
      ))}
      <Link to="/onboarding/manual" className="btn btn-secondary" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
        {t('qualities.add')}
      </Link>
    </div>
  )
}
