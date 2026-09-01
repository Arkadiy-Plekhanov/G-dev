import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { catalogApi, onboardingApi } from '../../api/resources'
import { CenterLoading, ErrorBanner } from '../../components/Feedback'
import { useMarkOnboarded } from '../../onboarding/OnboardingContext'

export default function IdealPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const markOnboarded = useMarkOnboarded()
  const [ideals, setIdeals] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)
  const [adopting, setAdopting] = useState(false)

  useEffect(() => {
    catalogApi.ideals().then(setIdeals).catch(setError)
  }, [])

  async function confirm() {
    setAdopting(true)
    setError(null)
    try {
      await onboardingApi.adoptIdeal(selected.id)
      markOnboarded()
      navigate('/', { replace: true })
    } catch (e) {
      setError(e)
    } finally {
      setAdopting(false)
    }
  }

  if (error && !ideals) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!ideals) return <CenterLoading />

  if (selected) {
    return (
      <div className="screen">
        <button className="btn btn-secondary" style={{ width: 'auto', marginBottom: 16 }} onClick={() => setSelected(null)}>
          ← {t('common.back')}
        </button>
        <h1>{selected.name.en}</h1>
        <p>{selected.bio.en}</p>
        <h3>{t('onboarding.idealComposition')}</h3>
        <div className="card">
          {selected.qualities.map((q) => (
            <Link key={q.quality.id} to={`/qualities/${q.quality.id}`} className="card-link" style={{ padding: '6px 0' }}>
              {q.quality.name.en}
            </Link>
          ))}
        </div>
        <ErrorBanner error={error} />
        <button className="btn btn-primary" onClick={confirm} disabled={adopting}>
          {adopting ? t('common.loading') : t('onboarding.confirmIdeal')}
        </button>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1>{t('onboarding.chooseIdeal')}</h1>
      {ideals.map((ideal) => (
        <div key={ideal.id} className="card card--tappable" role="button" tabIndex={0} onClick={() => setSelected(ideal)}>
          <h3>{ideal.name.en}</h3>
          <p style={{ margin: 0 }}>{ideal.qualities.slice(0, 4).map((q) => q.quality.name.en).join(', ')}…</p>
        </div>
      ))}
    </div>
  )
}
