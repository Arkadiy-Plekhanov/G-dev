import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

export default function ChoosePathPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="screen">
      <h1>{t('onboarding.title')}</h1>
      <p>{t('onboarding.subtitle')}</p>

      <div className="card card--tappable" role="button" tabIndex={0} onClick={() => navigate('/onboarding/ideal')}>
        <div className="eyebrow">A</div>
        <h3>{t('onboarding.pathIdeal')}</h3>
        <p style={{ margin: 0 }}>{t('onboarding.pathIdealHint')}</p>
      </div>

      <div className="card card--tappable" role="button" tabIndex={0} onClick={() => navigate('/onboarding/manual')}>
        <div className="eyebrow">B</div>
        <h3>{t('onboarding.pathManual')}</h3>
        <p style={{ margin: 0 }}>{t('onboarding.pathManualHint')}</p>
      </div>

      <div className="card" style={{ opacity: 0.6 }}>
        <div className="eyebrow">C</div>
        <h3>{t('onboarding.pathTest')}</h3>
        <p style={{ margin: 0 }}>{t('onboarding.pathTestHint')}</p>
      </div>
    </div>
  )
}
