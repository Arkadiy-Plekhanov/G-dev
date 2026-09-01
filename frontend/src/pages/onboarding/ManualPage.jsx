import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import QualityLibrary from '../../components/QualityLibrary'
import { useMarkOnboarded } from '../../onboarding/OnboardingContext'

/** Шаг «собрать свой набор» на онбординге -- та же самая библиотека
 *  качеств, что и на странице Qualities, плюс кнопка завершения.
 *  Раньше здесь была отдельная, почти идентичная реализация. */
export default function ManualPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const markOnboarded = useMarkOnboarded()

  return (
    <QualityLibrary
      title={t('onboarding.manualTitle')}
      searchPlaceholder={t('onboarding.manualSearch')}
      footer={(count) => count > 0 && (
        <button className="btn btn-primary" style={{ marginTop: 16 }}
                onClick={() => { markOnboarded(); navigate('/', { replace: true }) }}>
          {t('onboarding.manualDone')} ({count})
        </button>
      )}
    />
  )
}
