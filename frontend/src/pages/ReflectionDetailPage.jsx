import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { reflectionsApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

const TYPE_KEY = { daily: 'reflections.typeDaily', weekly: 'reflections.typeWeekly', cycle: 'reflections.typeCycle' }
// Порядок и подписи полей -- ключи из ReflectionOut -> (label, i18n-ключ).
const FIELDS = [
  ['what_worked', 'reflections.whatWorked'],
  ['what_did_not_work', 'reflections.whatDidNotWork'],
  ['qualities_observed_raw', 'reflections.qualitiesObserved'],
  ['insight', 'reflections.insight'],
  ['what_to_change', 'reflections.whatToChange'],
  ['what_stuck', 'reflections.whatStuck'],
  ['next_cycle_change', 'reflections.nextCycleChange'],
]

export default function ReflectionDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [reflection, setReflection] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    reflectionsApi.get(id).then(setReflection).catch(setError)
  }, [id])

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!reflection) return <CenterLoading />

  const backTo = reflection.cycle_id ? `/cycles/${reflection.cycle_id}`
    : reflection.goal_id ? `/goals/${reflection.goal_id}` : '/reflections'

  return (
    <div className="screen">
      <Link to={backTo} style={{ fontSize: '0.85rem' }}>← {t('common.back')}</Link>
      <h1>{t(TYPE_KEY[reflection.reflection_type_code] || reflection.reflection_type_code)}</h1>
      <p className="eyebrow">{reflection.occurred_at}</p>

      {FIELDS.filter(([key]) => reflection[key]).map(([key, labelKey]) => (
        <div key={key} className="card">
          <div className="eyebrow">{t(labelKey)}</div>
          <div style={{ marginTop: 4 }}>{reflection[key]}</div>
        </div>
      ))}
    </div>
  )
}
