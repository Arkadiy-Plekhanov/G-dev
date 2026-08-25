import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import GoogleSignInButton from '../auth/GoogleSignInButton'
import { ErrorBanner } from '../components/Feedback'

export default function LoginPage() {
  const { t } = useTranslation()
  const { loginWithGoogle } = useAuth()
  const [error, setError] = useState(null)

  const handleCredential = useCallback(async (idToken) => {
    setError(null)
    try {
      await loginWithGoogle(idToken)
    } catch (e) {
      setError(e)
    }
  }, [loginWithGoogle])

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="eyebrow">Qualities</div>
      <h1>{t('auth.tagline')}</h1>
      <p>{t('auth.signInHint')}</p>
      <ErrorBanner error={error} />
      <div style={{ marginTop: 24 }}>
        <GoogleSignInButton onCredential={handleCredential} />
      </div>
    </div>
  )
}
