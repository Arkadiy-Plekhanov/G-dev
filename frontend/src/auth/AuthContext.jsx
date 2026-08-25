import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authApi } from '../api/resources'
import { getTokens, clearTokens, ApiError } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    const { access } = getTokens()
    if (!access) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await authApi.me()
      setUser(me)
    } catch (e) {
      if (e instanceof ApiError) clearTokens()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshMe() }, [refreshMe])

  const loginWithGoogle = useCallback(async (idToken) => {
    await authApi.loginWithGoogle(idToken)
    await refreshMe()
  }, [refreshMe])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
