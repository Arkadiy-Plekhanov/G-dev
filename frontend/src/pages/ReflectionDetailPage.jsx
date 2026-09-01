import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { reflectionsApi, qualitiesApi } from '../api/resources'
import { get } from '../api/client'
import { CenterLoading, ErrorBanner } from '../components/Feedback'
import { REFLECTION_FIELDS } from '../lib/reflectionFields'
import { SCORE_KEY, REFLECTION_TYPE_KEY } from '../lib/displayMaps'


export default function ReflectionDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [reflection, setReflection] = useState(null)
  const [expressions, setExpressions] = useState(null)
  const [qualityNames, setQualityNames] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    reflectionsApi.get(id).then(setReflection).catch(setError)
  }, [id])

  useEffect(() => {
    // §1 обратной связи: "лог качеств из соответствующего действия как мы
    // делаем на других карточках" -- та же связка, что уже видна на
    // карточке действия (ActionDetailPage), только через reflection.action_id.
    // Без action_id (чистая рефлексия без указанных качеств) этот блок
    // просто не появляется -- легитимное состояние, не "недоделанное".
    if (!reflection?.action_id) return
    Promise.all([get(`/actions/${reflection.action_id}/expressions`), qualitiesApi.list()])
      .then(([exprs, mine]) => {
        setExpressions(exprs)
        setQualityNames(Object.fromEntries(mine.map((q) => [q.id, q.name.en])))
      })
      .catch(() => {})
  }, [reflection])

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!reflection) return <CenterLoading />

  const backTo = reflection.cycle_id ? `/cycles/${reflection.cycle_id}`
    : reflection.goal_id ? `/goals/${reflection.goal_id}` : '/reflections'

  return (
    <div className="screen">
      <Link to={backTo} style={{ fontSize: '0.85rem' }}>← {t('common.back')}</Link>
      <h1>{t(REFLECTION_TYPE_KEY[reflection.reflection_type_code] || reflection.reflection_type_code)}</h1>
      <p className="eyebrow">{reflection.occurred_at}</p>

      {REFLECTION_FIELDS.filter(([key]) => reflection[key]).map(([key, labelKey]) => (
        <div key={key} className="card">
          <div className="eyebrow">{t(labelKey)}</div>
          <div style={{ marginTop: 4 }}>{reflection[key]}</div>
        </div>
      ))}

      {expressions && expressions.length > 0 && (
        <>
          <h3>{t('action.qualitiesShown')}</h3>
          {expressions.map((e) => (
            <Link key={e.id} to={`/qualities/${e.quality_id}`} className="card card--tappable" style={{ display: 'flex', justifyContent: 'space-between', textDecoration: 'none', color: 'inherit' }}>
              <span>{qualityNames[e.quality_id] || '…'}</span>
              <span className={`pill${e.score === 0 ? ' pill--brick' : ''}`}>{t(`rating.${SCORE_KEY[e.score]}.name`)}</span>
            </Link>
          ))}
        </>
      )}
    </div>
  )
}
