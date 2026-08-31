import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { cyclesApi, actionsApi, reflectionsApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

/** §1.3: заголовок с периодом и прогрессом по времени, привязанные цели/
 * качества, действия внутри периода, рефлексии, поле резюме. */
export default function SeasonDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [season, setSeason] = useState(null)
  const [actions, setActions] = useState([])
  const [reflections, setReflections] = useState([])
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    cyclesApi.get(id).then(setSeason).catch(setError)
    // Рефлексии -- общий список (API отдаёт последние 50), фильтруем на
    // клиенте по cycle_id: отдельного query-параметра на бэкенде для
    // "рефлексии этого цикла" нет, а заводить его ради одного экрана
    // Фазы 1 -- лишнее расширение API, которого спецификация прямо не
    // просит ("эта фаза не меняет API").
    reflectionsApi.list().then((all) => setReflections(all.filter((r) => r.cycle_id === id))).catch(() => {})
  }, [id])

  useEffect(() => {
    if (!season?.start_date) return
    actionsApi.list({ limit: 100 }).then((all) => {
      setActions(all.filter((a) => a.occurred_at >= season.start_date
        && (!season.end_date || a.occurred_at <= season.end_date)))
    }).catch(() => {})
  }, [season])

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!season) return <CenterLoading />

  let progress = null
  if (season.start_date && season.end_date) {
    const start = new Date(season.start_date)
    const end = new Date(season.end_date)
    const now = new Date()
    const totalDays = Math.max(1, Math.round((end - start) / 86400000))
    const doneDays = Math.min(totalDays, Math.max(0, Math.round((now - start) / 86400000)))
    progress = { done: doneDays, total: totalDays, pct: Math.round((doneDays / totalDays) * 100) }
  }

  async function handleDelete() {
    if (!window.confirm(t('seasons.deleteConfirm'))) return
    setDeleting(true)
    try {
      await cyclesApi.remove(id)
      navigate('/cycles', { replace: true })
    } catch (e) {
      setError(e)
      setDeleting(false)
    }
  }

  return (
    <div className="screen">
      <Link to="/cycles" style={{ fontSize: '0.85rem' }}>← {t('seasons.title')}</Link>
      <h1>{season.name}</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span className={`pill${season.status_code === 'active' ? ' pill--gold' : ''}`}>{season.status_code}</span>
        <span className="eyebrow" style={{ alignSelf: 'center' }}>{season.start_date || '…'} → {season.end_date || '…'}</span>
      </div>

      {progress && (
        <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, marginBottom: 16 }}>
          <div style={{ height: '100%', borderRadius: 3, background: 'var(--growth)', width: `${progress.pct}%` }} />
        </div>
      )}
      {progress && <p className="eyebrow" style={{ marginTop: -12 }}>{t('seasons.daysElapsed', progress)}</p>}

      {season.description && <p>{season.description}</p>}

      {season.qualities.length > 0 && (
        <>
          <h3>{t('seasons.qualities')}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {season.qualities.map((q) => <Link key={q.id} to={`/qualities/${q.id}`} className="pill pill--tappable" style={{ textDecoration: 'none' }}>{q.name.en}</Link>)}
          </div>
        </>
      )}
      {season.goals.length > 0 && (
        <>
          <h3>{t('seasons.goals')}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {season.goals.map((g) => <Link key={g.id} to={`/goals/${g.id}`} className="pill pill--tappable" style={{ textDecoration: 'none' }}>{g.name}</Link>)}
          </div>
        </>
      )}

      <h3>{t('seasons.actionsInPeriod')}</h3>
      {actions.length === 0 && <p className="empty-state">{t('home.noActions')}</p>}
      {actions.map((a) => (
        <div key={a.id} className="card">
          <div>{a.name}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>{a.occurred_at}</div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>{t('seasons.reflectionsInSeason')}</h3>
        <Link to={`/reflections/new?cycle_id=${id}`} style={{ fontSize: '0.85rem' }}>{t('seasons.addReflection')}</Link>
      </div>
      {reflections.map((r) => (
        <Link key={r.id} to={`/reflections/${r.id}`} className="card card--tappable" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div className="eyebrow">{r.occurred_at} · {t(`reflections.type${r.reflection_type_code.charAt(0).toUpperCase()}${r.reflection_type_code.slice(1)}`)}</div>
          {r.insight && <div style={{ marginTop: 4 }}>{r.insight}</div>}
        </Link>
      ))}

      {season.summary && (
        <>
          <h3>{t('seasons.summary')}</h3>
          <p>{season.summary}</p>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <Link to={`/cycles/${id}/edit`} className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', flex: 1 }}>
          {t('common.edit')}
        </Link>
        <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleDelete} disabled={deleting}>
          {t('seasons.delete')}
        </button>
      </div>
    </div>
  )
}
