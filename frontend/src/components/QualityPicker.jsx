import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { catalogApi, qualitiesApi } from '../api/resources'

/**
 * Выбор качества для действия.
 *
 * Ищет по ВСЕМУ каталогу, а не только по уже принятым качествам. Раньше
 * поиск фильтровал лишь myQualities -- то есть найти можно было только то,
 * что уже и так показано выше, и весь смысл поиска пропадал: чтобы
 * отметить качество, которого нет в фокусе, приходилось уходить на другую
 * страницу, принимать его там и возвращаться. Реальная жизнь так не
 * работает -- поступок задействует то качество, которое задействует.
 *
 * Качества, которых у пользователя ещё нет, принимаются на лету в момент
 * выбора (POST /v1/qualities), после чего сразу подставляются в действие.
 */
export default function QualityPicker({ myQualities, excludeIds, onPick, onAdopted }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState([])
  const [adoptingId, setAdoptingId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    catalogApi.qualities().then(setCatalog).catch(() => setCatalog([]))
  }, [])

  const { rest, fromCatalog } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const available = myQualities.filter((mq) => !excludeIds.has(mq.id))
    const matches = (name) => !q || name.toLowerCase().includes(q)
    const mineByCatalogId = new Set(myQualities.map((mq) => mq.catalog_quality_id))

    return {
      // Фокус-качества здесь НЕ показываются: они и так уже все на экране
      // строками с оценкой (см. QualityRatingList). Раньше поиск дублировал
      // ровно тот же список, что виден выше -- то есть «поиск по всем 169»
      // на деле показывал те же шесть фокусных, и смысл поиска пропадал
      // (повторявшаяся обратная связь). Здесь -- только то, чего на экране
      // ещё нет: свои внефокусные и весь остальной каталог.
      // Оба списка -- ТОЛЬКО по запросу. Без запроса пикер пуст: это
      // поиск по всем 169, а не «ещё один список качеств». Раньше `rest`
      // показывался сразу и без запроса -- то есть внефокусные качества
      // вываливались выпадающим списком, ровно то дублирующее поведение,
      // которое до этого убрали у фокусных.
      rest: q ? available.filter((mq) => mq.focus_code !== 'current_focus' && matches(mq.name.en)) : [],
      fromCatalog: q
        ? catalog.filter((cq) => !mineByCatalogId.has(cq.id) && matches(cq.name.en))
        : [],
    }
  }, [myQualities, excludeIds, query, catalog])

  async function adoptThenPick(catalogQuality) {
    setAdoptingId(catalogQuality.id)
    setError(null)
    try {
      const adopted = await qualitiesApi.adopt({ catalog_quality_id: catalogQuality.id })
      onAdopted?.(adopted)
      onPick(adopted)
      setQuery('')
    } catch (e) {
      setError(e.message)
    } finally {
      setAdoptingId(null)
    }
  }

  const nothingAtAll = rest.length + fromCatalog.length === 0

  return (
    <div className="card">
      <input
        type="text"
        placeholder={t('action.searchAllQualities')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', padding: 10, border: '1px solid var(--line)', borderRadius: 6, marginBottom: 8 }}
      />
      {error && <p className="error-text">{error}</p>}
      {nothingAtAll && <p style={{ margin: '8px 0' }}>{query.trim() ? t('action.noQualityMatches') : t('action.typeToSearch')}</p>}

      {rest.map((mq) => (
        <div key={mq.id} className="quality-search-result" onClick={() => onPick(mq)}>
          <span>{mq.name.en}</span>
        </div>
      ))}

      {fromCatalog.length > 0 && (
        <div className="eyebrow" style={{ padding: 'var(--space-3) var(--space-3) 0' }}>
          {t('action.fromCatalog')}
        </div>
      )}
      {fromCatalog.map((cq) => (
        <div
          key={cq.id}
          className="quality-search-result"
          onClick={() => adoptingId === null && adoptThenPick(cq)}
        >
          <span>{cq.name.en}</span>
          <span className="pill">{adoptingId === cq.id ? t('common.saving') : t('action.addToMine')}</span>
        </div>
      ))}
    </div>
  )
}
