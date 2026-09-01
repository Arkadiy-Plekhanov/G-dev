import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { mintSession, setSession } from '../test/helpers'
import { qualitiesApi, catalogApi, actionsApi } from '../api/resources'
import LogActionPage from './LogActionPage'

describe('LogActionPage — the core daily-practice loop, against the real backend', () => {
  let session, quality

  beforeEach(async () => {
    localStorage.clear()
    session = mintSession()
    setSession(session)

    const catalog = await catalogApi.qualities()
    quality = await qualitiesApi.adopt({ catalog_quality_id: catalog[0].id, focus_code: 'current_focus' })
  })

  it('rating is optional: an unrated quality never blocks saving, and simply is not recorded', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><LogActionPage /></MemoryRouter>)

    await user.type(screen.getByPlaceholderText(/Describe what you did/i), 'Ran a difficult negotiation')

    const saveButton = screen.getByRole('button', { name: /Save action/i })
    // Ноль качеств -- валидное, самостоятельное состояние (бэкенд явно
    // поддерживает qualities: [], см. test_atomic_action_without_qualities_still_works).
    expect(saveButton.disabled).toBe(false)

    await user.click(screen.getByRole('button', { name: /Search all qualities/i }))
    await user.click(await screen.findByText(quality.name.en))

    // Качество добавлено, но НЕ оценено -- сохранять по-прежнему можно.
    // Раньше здесь блокировалось: но теперь на экране сразу показаны ВСЕ
    // фокус-качества, и требование оценить каждое означало бы, что человек
    // обязан проставить оценку всему подряд, включая непроявившееся.
    // Неоценённое просто не отправляется на бэкенд -- это самый частый
    // случай, а не «забыл заполнить».
    expect(saveButton.disabled).toBe(false)

    await user.click(screen.getByLabelText(/^Flame/))
    expect(saveButton.disabled).toBe(false)
  })

  it('saving actually creates a real action with the real quality expression in the live database', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><LogActionPage /></MemoryRouter>)

    await user.type(screen.getByPlaceholderText(/Describe what you did/i), 'Ran a difficult negotiation')
    await user.click(screen.getByRole('button', { name: /Search all qualities/i }))
    await user.click(await screen.findByText(quality.name.en))
    await user.click(screen.getByLabelText(/^Gem/))
    await user.click(screen.getByRole('button', { name: /Save action/i }))

    await waitFor(async () => {
      const actions = await actionsApi.list()
      expect(actions.length).toBe(1)
      expect(actions[0].name).toBe('Ran a difficult negotiation')
      expect(actions[0].quality_count).toBe(1)
    }, { timeout: 3000 })

    // и проверяем, что реально ушло на бэкенд score=4, без всякого is_relevant
    const actions = await actionsApi.list()
    const expressions = await actionsApi.expressions(actions[0].id)
    expect(expressions).toHaveLength(1)
    expect(expressions[0].score).toBe(4)
    expect(expressions[0]).not.toHaveProperty('is_relevant')
  })

  it('rating 0 is a real, valid choice (relevant but inverted), not treated as "unset"', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><LogActionPage /></MemoryRouter>)

    await user.type(screen.getByPlaceholderText(/Describe what you did/i), 'Lost my temper')
    await user.click(screen.getByRole('button', { name: /Search all qualities/i }))
    await user.click(await screen.findByText(quality.name.en))
    await user.click(screen.getByLabelText(/Went the other way/))

    const saveButton = screen.getByRole('button', { name: /Save action/i })
    expect(saveButton.disabled).toBe(false)
    await user.click(saveButton)

    await waitFor(async () => {
      const actions = await actionsApi.list()
      const expressions = await actionsApi.expressions(actions[0].id)
      expect(expressions[0].score).toBe(0)
    }, { timeout: 3000 })
  })
})
