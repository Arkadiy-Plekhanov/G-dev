import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { qualitiesApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

export default function QualityDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    qualitiesApi.overview(id).then(setData).catch(setError)
  }, [id])

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!data) return <CenterLoading />

  const { quality: q, recent_expressions: recent, by_context: byContext } = data

  return (
    <div className="screen">
      <Link to="/qualities" style={{ fontSize: '0.85rem' }}>← {t('qualities.title')}</Link>
      <h1>{q.name.en}</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="pill">{q.dev_status_code}</span>
        {q.focus_code === 'current_focus' && <span className="pill pill--gold">{t('qualities.focus')}</span>}
      </div>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div className="eyebrow">{t('qualities.average')}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem' }}>
              {q.avg_score_all_time != null ? Number(q.avg_score_all_time).toFixed(1) : '—'}
            </div>
          </div>
          <div>
            <div className="eyebrow">{t('qualities.trend')}</div>
            <div>{q.trend || '—'}</div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
          {q.stability} · {q.confidence}
        </div>
      </div>

      <h3>{t('qualities.recentExpressions')}</h3>
      {recent.length === 0 && <p className="empty-state">{t('home.noActions')}</p>}
      {recent.map((e) => (
        <div key={e.action_id + e.occurred_at} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div>{e.action_name}</div>
            <span className="eyebrow">{e.occurred_at}</span>
          </div>
          <span>{e.score}</span>
        </div>
      ))}

      <h3>{t('qualities.byContext')}</h3>
      {byContext.map((c) => (
        <div key={c.context_id ?? 'none'} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{c.context_label || '—'}</span>
          <span>{c.count} · {Number(c.avg_score).toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}
