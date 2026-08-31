import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { get } from '../api/client'
import { qualitiesApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

const SCORE_KEY = { 0: 'inverted', 1: 'spark', 2: 'kindling', 3: 'flame', 4: 'gem' }

/** Карточка одного действия -- бэкенд (GET /actions/{id} и
 * /actions/{id}/expressions) был готов давно, экрана не было вообще:
 * из истории и с карточки цели ссылки вели сразу на цель, минуя само
 * действие -- странно для системы, вся модель которой строится вокруг
 * учёта поступков (обратная связь с реального использования).
 *
 * qualityNames строится отдельным запросом (qualitiesApi.list()), потому
 * что ExpressionOut отдаёт только quality_id, без имени -- то же самое
 * пересечение уже делает CatalogQualityPage для своих целей. */
export default function ActionDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [action, setAction] = useState(null)
  const [expressions, setExpressions] = useState(null)
  const [context, setContext] = useState(null)
  const [qualityNames, setQualityNames] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([get(`/actions/${id}`), get(`/actions/${id}/expressions`), get('/reference/action-contexts')])
      .then(([a, exprs, contexts]) => {
        setAction(a)
        setExpressions(exprs)
        setContext(contexts.find((c) => c.id === a.context_id) || null)
      })
      .catch(setError)
  }, [id])

  useEffect(() => {
    qualitiesApi.list().then((mine) => {
      setQualityNames(Object.fromEntries(mine.map((q) => [q.id, q.name.en])))
    }).catch(() => {})
  }, [])

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!action || !expressions) return <CenterLoading />

  return (
    <div className="screen">
      {action.goal_id
        ? <Link to={`/goals/${action.goal_id}`} style={{ fontSize: '0.85rem' }}>← {t('goals.title')}</Link>
        : <Link to="/actions" style={{ fontSize: '0.85rem' }}>← {t('actionsHistory.title')}</Link>}
      <h1>{action.name}</h1>
      {action.description && <p>{action.description}</p>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="eyebrow">{action.occurred_at}</span>
        {context && <span className="pill">{context.label}</span>}
        {action.goal_id && <span className="pill pill--gold">{t('goals.title')}</span>}
      </div>

      <h3>{t('action.qualitiesShown')}</h3>
      {expressions.length === 0 && <p className="empty-state">{t('action.noQualities')}</p>}
      {expressions.map((e) => (
        <Link key={e.id} to={`/qualities/${e.quality_id}`} className="card card--tappable" style={{ display: 'flex', justifyContent: 'space-between', textDecoration: 'none', color: 'inherit' }}>
          <span>{qualityNames[e.quality_id] || '…'}</span>
          <span className={`pill${e.score === 0 ? ' pill--brick' : ''}`}>{t(`rating.${SCORE_KEY[e.score]}.name`)}</span>
        </Link>
      ))}
    </div>
  )
}
