import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { reflectionsApi, goalsApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'
import { REFLECTION_FIELDS } from '../lib/reflectionFields'

const TYPE_KEY = { daily: 'reflections.typeDaily', weekly: 'reflections.typeWeekly', goal: 'reflections.typeGoal', cycle: 'reflections.typeCycle' }

export default function ReflectionsListPage() {
  const { t } = useTranslation()
  const [reflections, setReflections] = useState(null)
  const [goalNames, setGoalNames] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([reflectionsApi.list(), goalsApi.list()])
      .then(([r, goals]) => {
        setReflections(r)
        setGoalNames(Object.fromEntries(goals.map((g) => [g.id, g.name])))
      })
      .catch(setError)
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
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {r.occurred_at} ·{' '}
            {r.goal_id && goalNames[r.goal_id]
              ? goalNames[r.goal_id]
              : t(TYPE_KEY[r.reflection_type_code] || r.reflection_type_code)}
          </div>
          {/* §13: полный текст всех заполненных полей, не одно усечённое --
              обратная связь с реального использования: последовательное
              чтение своих рефлексий подряд по списку и есть сам смысл этого
              экрана, а не превью для перехода куда-то ещё. */}
          {REFLECTION_FIELDS.filter(([key]) => r[key]).map(([key, labelKey]) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <div className="eyebrow">{t(labelKey)}</div>
              <div>{r[key]}</div>
            </div>
          ))}
          {REFLECTION_FIELDS.every(([key]) => !r[key]) && <span className="eyebrow">—</span>}
        </Link>
      ))}
    </div>
  )
}
