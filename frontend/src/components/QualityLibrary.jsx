import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { growthStage } from '../lib/growthStage'
import { Link } from 'react-router-dom'
import { qualitiesApi, catalogApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from './Feedback'

/**
 * Библиотека всех качеств (169) с поиском и переключением фокуса прямо
 * в строке -- ОДИН компонент для страницы «Qualities» и для шага выбора
 * на онбординге. Раньше это были две почти одинаковые реализации, и они
 * успели разойтись: онбординговая работала как надо, а страница качеств
 * показывала только уже принятые (повторявшаяся обратная связь).
 * Отличались они ровно тремя вещами -- заголовком, плейсхолдером поиска
 * и кнопкой «готово» внизу; всё три и стали параметрами.
 *
 * footer -- функция (количество в фокусе) => JSX, чтобы онбординг мог
 * показать «Done (N)», а обычная страница -- ничего.
 */

export default function QualityLibrary({ title, searchPlaceholder, footer }) {
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState(null)
  const [adoptedByCatalogId, setAdopted] = useState(new Map())
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([catalogApi.qualities(), qualitiesApi.list()])
      .then(([cat, mine]) => {
        setCatalog(cat)
        setAdopted(new Map(mine.map((q) => [q.catalog_quality_id, q])))
      })
      .catch(setError)
  }, [])

  const visible = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    const matched = catalog.filter((c) => !q || c.name.en.toLowerCase().includes(q))
    // Свои -- наверх: это то, с чем человек работает каждый день, а
    // остальные 160+ нужны заметно реже. Внутри групп -- алфавит,
    // как в каталоге.
    return [
      ...matched.filter((c) => adoptedByCatalogId.has(c.id)),
      ...matched.filter((c) => !adoptedByCatalogId.has(c.id)),
    ]
  }, [catalog, adoptedByCatalogId, query])

  async function toggle(catalogQuality) {
    setError(null)
    setBusyId(catalogQuality.id)
    try {
      const existing = adoptedByCatalogId.get(catalogQuality.id)
      if (existing) {
        await qualitiesApi.remove(existing.id)
        setAdopted((prev) => { const next = new Map(prev); next.delete(catalogQuality.id); return next })
      } else {
        const uq = await qualitiesApi.adopt({ catalog_quality_id: catalogQuality.id, focus_code: 'current_focus' })
        setAdopted((prev) => new Map(prev).set(catalogQuality.id, uq))
      }
    } catch (e) {
      setError(e)
    } finally {
      setBusyId(null)
    }
  }

  if (error && !catalog) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!catalog) return <CenterLoading />

  return (
    <div className="screen">
      <h1>{title ?? t('qualities.title')}</h1>
      <input
        type="text"
        placeholder={searchPlaceholder ?? t('action.searchAllQualities')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', padding: 10, border: '1px solid var(--line)', borderRadius: 6, marginBottom: 12 }}
      />
      <ErrorBanner error={error} />
      {visible.length === 0 && <p className="empty-state">{t('action.noQualityMatches')}</p>}

      {visible.map((c) => {
        const mine = adoptedByCatalogId.get(c.id)
        return (
          <div key={c.id} className="card stat-row">
            {/* Название ведёт на карточку качества: у принятого -- по
                uq.id (там статистика), у непринятого -- по id каталога
                (там определение и та же кнопка добавления). */}
            <Link to={`/qualities/${mine ? mine.id : c.id}`} className="card-link stat-row-name">
              <div>{c.name.en}</div>
              {mine
                ? <span className="eyebrow">{t(`stats.stage.${growthStage(mine) ?? 'none'}`)}
                    {mine.avg_score_all_time != null && ` · ${Number(mine.avg_score_all_time).toFixed(1)}`}</span>
                : <span className="eyebrow">{c.definition.en}</span>}
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: 'auto', flexShrink: 0 }}
              disabled={busyId === c.id}
              onClick={() => toggle(c)}
              aria-label={mine ? t('qualities.removeFromFocus') : t('qualities.addToFocus')}
            >
              {mine ? '✓' : '+'}
            </button>
          </div>
        )
      })}
      {footer?.(adoptedByCatalogId.size)}
    </div>
  )
}
