import { useTranslation } from 'react-i18next'

export function ErrorBanner({ error, onRetry }) {
  const { t } = useTranslation()
  if (!error) return null
  const message = error.code && t(`errors.${error.code}`, { defaultValue: '' })
  return (
    <div className="error-banner">
      {message || error.message || t('errors.UNKNOWN_ERROR')}
      {onRetry && (
        <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}

export function CenterLoading() {
  return (
    <div className="center-loading">
      <span className="spinner" />
    </div>
  )
}
