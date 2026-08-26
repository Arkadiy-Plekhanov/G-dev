import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { catalogApi, qualitiesApi } from '../../api/resources'
import { CenterLoading, ErrorBanner } from '../../components/Feedback'
import { useMarkOnboarded } from '../../onboarding/OnboardingContext'

export default function ManualPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const markOnboarded = useMarkOnboarded()
  const [catalog, setCatalog] = useState(null)
  const [adoptedIds, setAdoptedIds] = useState(new Set())
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    catalogApi.qualities().then(setCatalog).catch(setError)
  }, [])

  const visible = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    return catalog.filter((c) => !q || c.name.en.toLowerCase().includes(q))
  }, [catalog, query])

  async function adopt(catalogQuality) {
    setError(null)
    try {
      await qualitiesApi.adopt({ catalog_quality_id: catalogQuality.id, focus_code: 'current_focus' })
      setAdoptedIds((prev) => new Set(prev).add(catalogQuality.id))
    } catch (e) {
      setError(e)
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
        const isAdopted = adoptedIds.has(c.id)
        return (
          <div key={c.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{c.name.en}</strong>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>{c.definition.en}</p>
            </div>
            <button className="btn btn-secondary" style={{ width: 'auto', flexShrink: 0, marginLeft: 12 }}
                    disabled={isAdopted} onClick={() => adopt(c)}>
              {isAdopted ? '✓' : '+'}
            </button>
          </div>
        )
      })}
      {adoptedIds.size > 0 && (
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => { markOnboarded(); navigate('/', { replace: true }) }}>
          {t('onboarding.manualDone')} ({adoptedIds.size})
        </button>
      )}
    </div>
  )
}
