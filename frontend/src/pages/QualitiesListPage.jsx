import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { growthStage } from '../lib/growthStage'
import { Link } from 'react-router-dom'
import { qualitiesApi, catalogApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

/** Библиотека качеств -- по умолчанию мои (как раньше, без регрессии для
 * тех, кто уже пользуется), поиск открывает ВЕСЬ каталог (169), не только
 * уже принятое (реальная обратная связь: "qualities page still doesn't
 * contain all qualities and shows only the one in focus"). Тот же
 * паттерн, что уже проверен в QualityPicker -- без запроса каталог не
 * вываливается целиком, это было бы избыточно на каждый заход на
 * страницу ради редкого случая "ищу что-то новое".
 *
 * Непринятое качество ведёт на ту же единую карточку (/qualities/:id --
 * см. QualityDetailPage), где и живёт кнопка "добавить" -- список здесь
 * только показывает и ведёт, не дублирует логику принятия. */
export default function QualitiesListPage() {
  const { t } = useTranslation()
  const [qualities, setQualities] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    qualitiesApi.list().then(setQualities).catch(setError)
    catalogApi.qualities().then(setCatalog).catch(() => setCatalog([]))
  }, [])

  const { mine, fromCatalog } = useMemo(() => {
    if (!qualities) return { mine: [], fromCatalog: [] }
    const q = query.trim().toLowerCase()
    const matches = (name) => !q || name.toLowerCase().includes(q)
    const mineByCatalogId = new Set(qualities.map((mq) => mq.catalog_quality_id))
    return {
      mine: qualities.filter((mq) => matches(mq.name.en)),
      fromCatalog: q ? catalog.filter((cq) => !mineByCatalogId.has(cq.id) && matches(cq.name.en)) : [],
    }
  }, [qualities, catalog, query])

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!qualities) return <CenterLoading />

  return (
    <div className="screen">
      <h1>{t('qualities.title')}</h1>
      <input
        type="text"
        placeholder={t('action.searchAllQualities')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', padding: 10, border: '1px solid var(--line)', borderRadius: 6, marginBottom: 12 }}
      />
      {qualities.length === 0 && !query && <p className="empty-state">{t('qualities.empty')}</p>}

      {mine.map((q) => (
        <Link key={q.id} to={`/qualities/${q.id}`} className="card card--tappable card-link">
          <div className="stat-row-name">
            {q.name.en}
            {q.focus_code === 'current_focus' && <span className="eyebrow" style={{ marginLeft: 6 }}>{t('qualities.inFocus')}</span>}
          </div>
          <div className="stat-row-details">
            <span>{t(`stats.stage.${growthStage(q) ?? 'none'}`)}</span>
            {q.avg_score_all_time != null && (
              <span className="eyebrow">{Number(q.avg_score_all_time).toFixed(1)}</span>
            )}
          </div>
        </Link>
      ))}

      {fromCatalog.length > 0 && (
        <div className="eyebrow" style={{ margin: '16px 0 8px' }}>{t('action.fromCatalog')}</div>
      )}
      {fromCatalog.map((cq) => (
        <Link key={cq.id} to={`/qualities/${cq.id}`} className="card card--tappable card-link card-link--row">
          <span>{cq.name.en}</span>
          <span className="pill">{t('action.addToMine')}</span>
        </Link>
      ))}

      {query && mine.length === 0 && fromCatalog.length === 0 && (
        <p className="empty-state">{t('action.noQualityMatches')}</p>
      )}
    </div>
  )
}
