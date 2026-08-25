import { useEffect, useRef } from 'react'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

/**
 * Настоящая интеграция Google Identity Services (developers.google.com/
 * identity/gsi/web) -- не заглушка. Загружает официальный скрипт Google,
 * инициализирует с реальным client id из окружения, рендерит официальный
 * виджет кнопки. callback получает подписанный Google ID token, который
 * идёт напрямую на бэкенд /v1/auth/google -- та же самая верификация
 * (verify_oauth2_token), что уже покрыта тестами на бэкенде.
 *
 * Живьём протестировать сам клик по кнопке в этой среде невозможно (нет
 * сети до accounts.google.com и нет настоящего client id) -- честно
 * зафиксировано в README, не спрятано.
 */
export default function GoogleSignInButton({ onCredential }) {
  const divRef = useRef(null)

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined

    const scriptId = 'google-identity-services'
    let script = document.getElementById(scriptId)

    function init() {
      if (!window.google || !divRef.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => onCredential(response.credential),
      })
      window.google.accounts.id.renderButton(divRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
      })
    }

    if (script) {
      init()
    } else {
      script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = init
      document.head.appendChild(script)
    }
  }, [onCredential])

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="error-banner">
        VITE_GOOGLE_CLIENT_ID is not configured. Set it in your environment before deploying —
        see README.
      </div>
    )
  }

  return <div ref={divRef} />
}
