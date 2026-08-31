import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { actionsApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

const SCORE_LABEL_KEY = { 0: 'inverted', 1: 'spark', 2: 'kindling', 3: 'flame', 4: 'gem' }
const PAGE_SIZE = 20

/** §3: лента всех действий, группировка по дням, курсорная пагинация.
 * Намеренно КНОПКА "показать ещё", не бесконечный скролл -- у ленты есть
 * видимый конец действия ("больше нет"), это не бесконечный лайк-фид. */
export default function ActionsHistoryPage() {
  const { t } = useTranslation()
  const [actions, setActions] = useState(null)
  const [error, setError] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    actionsApi.list({ limit: PAGE_SIZE }).then((page) => {
      setActions(page)
      setHasMore(page.length === PAGE_SIZE)
    }).catch(setError)
  }, [])

  function loadMore() {
    if (!actions || actions.length === 0) return
    const last = actions[actions.length - 1]
    setLoadingMore(true)
    actionsApi.list({
      limit: PAGE_SIZE,
      before_occurred_at: last.occurred_at,
      before_created_at: last.created_at,
    }).then((page) => {
      setActions((prev) => [...prev, ...page])
      setHasMore(page.length === PAGE_SIZE)
    }).catch(setError).finally(() => setLoadingMore(false))
  }

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!actions) return <CenterLoading />

  // Группировка по дате -- Object не теряет порядок вставки для строковых
  // ключей формата YYYY-MM-DD, а actions уже приходят отсортированными
  // occurred_at DESC с бэкенда, так что группы естественно идут по убыванию.
  const byDay = {}
  for (const a of actions) {
    (byDay[a.occurred_at] ??= []).push(a)
  }

  return (
    <div className="screen">
      <h1>{t('actionsHistory.title')}</h1>

      {actions.length === 0 && (
        <div className="empty-state">
          <p>{t('actionsHistory.empty')}</p>
          <p style={{ fontSize: '0.85rem' }}>{t('actionsHistory.emptyHint')}</p>
        </div>
      )}

      {Object.entries(byDay).map(([day, dayActions]) => (
        <div key={day} style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{day}</div>
          {dayActions.map((a) => (
            <Link key={a.id} to={`/actions/${a.id}`} className="card card--tappable" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div>{a.name}</div>
              {a.avg_score != null && (
                <div className="eyebrow" style={{ marginTop: 4 }}>
                  {a.quality_count} {a.quality_count === 1 ? 'quality' : 'qualities'}
                </div>
              )}
            </Link>
          ))}
        </div>
      ))}

      {hasMore && actions.length > 0 && (
        <button className="btn btn-secondary" onClick={loadMore} disabled={loadingMore} style={{ width: '100%' }}>
          {loadingMore ? t('common.loading') : t('actionsHistory.loadMore')}
        </button>
      )}
    </div>
  )
}
