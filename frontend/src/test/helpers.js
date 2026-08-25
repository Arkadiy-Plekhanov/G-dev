import { execFileSync } from 'node:child_process'

/** Реальный пользователь + реальная пара токенов из живой БД (не мок).
 * Каждый вызов -- новый пользователь, безопасно для параллельных тестов. */
export function mintSession() {
  const out = execFileSync('python3', ['src/test/mint_session.py'], { cwd: process.cwd(), encoding: 'utf-8' })
  return JSON.parse(out)
}

export function setSession(session) {
  localStorage.setItem('qualities_access_token', session.access_token)
  localStorage.setItem('qualities_refresh_token', session.refresh_token)
}
