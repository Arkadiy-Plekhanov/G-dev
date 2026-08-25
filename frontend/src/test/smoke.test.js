import { describe, it, expect, beforeEach } from 'vitest'
import { mintSession, setSession } from './helpers'
import { authApi, qualitiesApi } from '../api/resources'

describe('integration harness smoke test', () => {
  let session
  beforeEach(() => {
    localStorage.clear()
    session = mintSession()
    setSession(session)
  })

  it('real fetch reaches the real live backend and /me returns the real user', async () => {
    const me = await authApi.me()
    expect(me.email).toBe(session.email)
  })

  it('a fresh user has zero qualities', async () => {
    const qualities = await qualitiesApi.list()
    expect(qualities).toEqual([])
  })
})
