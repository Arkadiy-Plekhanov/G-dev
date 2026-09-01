import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { catalogApi, qualitiesApi } from '../../api/resources'
import { CenterLoading, ErrorBanner } from '../../components/Feedback'
import { useMarkOnboarded } from '../../onboarding/OnboardingContext'

/** Ручной выбор качеств при онбординге.
 *
 * Два отдельных действия на одной строке, а не одно: тап по НАЗВАНИЮ ведёт
 * в карточку качества (посмотреть, прежде чем выбрать -- по обратной связи
 * с реального использования: раньше это было невозможно вообще), тап по
 * кнопке +/✓ выбирает или отменяет выбор на месте. adoptedIds хранит
 * catalog_quality_id -> uq.id (id принятого экземпляра), потому что для
 * отмены выбора нужен именно ЭТОТ id, не id из каталога.
 *
 * Кнопка была одноразовой (disabled после выбора, отменить было нельзя) --
 * теперь настоящий переключатель: повторный тап убирает качество и
 * возвращает состояние "не выбрано". */
export default function ManualPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const markOnboarded = useMarkOnboarded()
  const [catalog, setCatalog] = useState(null)
  const [adopted, setAdopted] = useState(new Map())
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    catalogApi.qualities().then(setCatalog).catch(setError)
  }, [])

  const visible = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    return catalog.filter((c) => !q || c.name.en.toLowerCase().includes(q))
  }, [catalog, query])

  async function toggle(catalogQuality) {
    setError(null)
    setBusyId(catalogQuality.id)
    try {
      const existingUqId = adopted.get(catalogQuality.id)
      if (existingUqId) {
        await qualitiesApi.remove(existingUqId)
        setAdopted((prev) => { const next = new Map(prev); next.delete(catalogQuality.id); return next })
      } else {
        const uq = await qualitiesApi.adopt({ catalog_quality_id: catalogQuality.id, focus_code: 'current_focus' })
        setAdopted((prev) => new Map(prev).set(catalogQuality.id, uq.id))
      }
    } catch (e) {
      setError(e)
    } finally {
      setBusyId(null)
    }
  }

  if (!catalog) return <CenterLoading />

  return (
    <div className="screen">
      <h1>{t('onboarding.manualTitle')}</h1>
      <input
        type="text"
        placeholder={t('onboarding.manualSearch')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', padding: 10, border: '1px solid var(--line)', borderRadius: 6, marginBottom: 12 }}
      />
      <ErrorBanner error={error} />
      {visible.map((c) => {
        const isAdopted = adopted.has(c.id)
        return (
          <div key={c.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link to={`/qualities/${c.id}`} className="card-link" style={{ minWidth: 0 }}>
              <strong>{c.name.en}</strong>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>{c.definition.en}</p>
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: 'auto', flexShrink: 0, marginLeft: 12 }}
              disabled={busyId === c.id}
              onClick={() => toggle(c)}
            >
              {isAdopted ? '✓' : '+'}
            </button>
          </div>
        )
      })}
      {adopted.size > 0 && (
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => { markOnboarded(); navigate('/', { replace: true }) }}>
          {t('onboarding.manualDone')} ({adopted.size})
        </button>
      )}
    </div>
  )
}
