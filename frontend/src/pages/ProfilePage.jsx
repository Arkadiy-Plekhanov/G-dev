import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { authApi } from '../api/resources'
import { ErrorBanner } from '../components/Feedback'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    setError(null)
    try {
      const data = await authApi.exportAccount()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qualities-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await authApi.deleteAccount()
      await logout()
      navigate('/', { replace: true })
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <h1>{t('profile.title')}</h1>
      <div className="card">
        <strong>{user?.display_name}</strong>
        <p style={{ margin: 0 }}>{user?.email}</p>
      </div>

      <ErrorBanner error={error} />

      <button className="btn btn-secondary" onClick={handleExport}>{t('profile.export')}</button>
      <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => logout().then(() => navigate('/'))}>
        {t('profile.signOut')}
      </button>

      {!confirmingDelete ? (
        <button className="btn btn-danger" style={{ marginTop: 24 }} onClick={() => setConfirmingDelete(true)}>
          {t('profile.deleteAccount')}
        </button>
      ) : (
        <div className="card" style={{ marginTop: 24, borderColor: 'var(--brick)' }}>
          <p>{t('profile.deleteConfirm')}</p>
          <button className="btn btn-danger" disabled={busy} onClick={handleDelete}>
            {busy ? t('common.loading') : t('profile.deleteAccount')}
          </button>
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setConfirmingDelete(false)}>
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
