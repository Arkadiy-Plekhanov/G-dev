const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/v1'

const TOKEN_KEY = 'qualities_access_token'
const REFRESH_KEY = 'qualities_refresh_token'

export function getTokens() {
  return {
    access: localStorage.getItem(TOKEN_KEY),
    refresh: localStorage.getItem(REFRESH_KEY),
  }
}

export function setTokens({ access_token, refresh_token }) {
  localStorage.setItem(TOKEN_KEY, access_token)
  localStorage.setItem(REFRESH_KEY, refresh_token)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

/** Ошибка API с сохранённым структурированным кодом ({code, message} из
 * бэкенда, см. app/errors.py) -- UI сверяется с .code, не парсит текст. */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

let refreshPromise = null

async function doRefresh() {
  const { refresh } = getTokens()
  if (!refresh) throw new ApiError(401, 'NO_REFRESH_TOKEN', 'Not signed in')
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  })
  if (!res.ok) {
    clearTokens()
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.detail?.code || 'REFRESH_FAILED', body?.detail?.message || 'Session expired')
  }
  const pair = await res.json()
  setTokens(pair)
  return pair
}

/**
 * Единая точка всех вызовов API. При первом 401 (просроченный access-токен)
 * автоматически пробует ОДИН refresh и повторяет запрос -- пользователь не
 * должен вручную перелогиниваться каждые 30 минут. Несколько одновременных
 * 401 (например, четыре параллельных запроса на экране) делят один и тот же
 * refresh (refreshPromise), а не рвутся ротацией на четыре разных токена
 * (что и так закрыто на бэкенде через FOR UPDATE, но клиенту незачем
 * специально это провоцировать).
 */
export async function apiFetch(path, options = {}, _retried = false) {
  const { access } = getTokens()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (access) headers.Authorization = `Bearer ${access}`

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401 && !_retried && getTokens().refresh) {
    refreshPromise = refreshPromise || doRefresh().finally(() => { refreshPromise = null })
    try {
      await refreshPromise
    } catch {
      clearTokens()
      throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in again')
    }
    return apiFetch(path, options, true)
  }

  if (res.status === 204) return null

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    const detail = body?.detail
    if (detail && typeof detail === 'object') {
      throw new ApiError(res.status, detail.code, detail.message)
    }
    throw new ApiError(res.status, 'UNKNOWN_ERROR', typeof detail === 'string' ? detail : 'Something went wrong')
  }
  return body
}

export const get = (path) => apiFetch(path)
export const post = (path, data) => apiFetch(path, { method: 'POST', body: JSON.stringify(data) })
export const patch = (path, data) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(data) })
export const del = (path) => apiFetch(path, { method: 'DELETE' })
