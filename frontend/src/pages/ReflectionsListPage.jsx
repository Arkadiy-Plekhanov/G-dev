import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { reflectionsApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

const TYPE_KEY = { daily: 'reflections.typeDaily', weekly: 'reflections.typeWeekly', cycle: 'reflections.typeCycle' }

export default function ReflectionsListPage() {
  const { t } = useTranslation()
  const [reflections, setReflections] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    reflectionsApi.list().then(setReflections).catch(setError)
  }, [])

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!reflections) return <CenterLoading />

  return (
    <div className="screen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{t('reflections.title')}</h1>
        <Link to="/reflections/new" className="btn btn-primary" style={{ textDecoration: 'none', padding: '8px 14px' }}>
          {t('reflections.new')}
        </Link>
      </div>

      {reflections.length === 0 && (
        <div className="empty-state">
          <p>{t('reflections.empty')}</p>
          <p style={{ fontSize: '0.85rem' }}>{t('reflections.emptyHint')}</p>
        </div>
      )}

      {reflections.map((r) => (
        <Link key={r.id} to={`/reflections/${r.id}`} className="card card--tappable" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div className="eyebrow">{r.occurred_at} · {t(TYPE_KEY[r.reflection_type_code] || r.reflection_type_code)}</div>
          <div style={{ marginTop: 4 }}>{r.insight || r.what_worked || r.what_did_not_work || '—'}</div>
        </Link>
      ))}
    </div>
  )
}
