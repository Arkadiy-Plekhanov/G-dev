import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { mintSession, setSession } from '../test/helpers'
import { goalsApi, qualitiesApi, catalogApi, actionsApi, cyclesApi } from '../api/resources'
import IdealPage from './onboarding/IdealPage'
import GoalDetailPage from './GoalDetailPage'
import { MemoryRouter as Router, Route, Routes } from 'react-router-dom'

beforeEach(() => {
  localStorage.clear()
  setSession(mintSession())
})

describe('onboarding ideal path, against the real backend', () => {
  it('shows all 3 real ideals and adopts the full composition on confirm', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><IdealPage /></MemoryRouter>)

    const marcus = await screen.findByText('Marcus Aurelius', {}, { timeout: 3000 })
    await user.click(marcus.closest('.card'))

    // карточка идеала: биография + состав качеств реально с бэкенда
    await screen.findByText(/Stoic philosopher/i)
    expect(screen.getByText('Wisdom')).toBeInTheDocument()
    expect(screen.getByText('Courage')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Adopt these qualities/i }))

    await waitFor(async () => {
      const mine = await qualitiesApi.list()
      expect(mine.length).toBe(6) // состав Марка Аврелия -- 6 качеств
      expect(mine.every((q) => q.source === 'ideal')).toBe(true)
    }, { timeout: 3000 })
  })
})

describe('goal overview card, against the real backend', () => {
  it('shows the real vs-baseline comparison for a real goal with real actions', async () => {
    const goal = await goalsApi.create({ name: 'Lead the launch', status_code: 'active', priority_code: 'p1_critical' })
    const catalog = await catalogApi.qualities()
    const q = await qualitiesApi.adopt({ catalog_quality_id: catalog[0].id })

    // Внутри цели: три оценки по 4 -> avg_in_goal = 4.0, n=3 (минимум для
    // growthStage(), чтобы стадия показывалась честно, а не как "мало
    // данных" -- см. lib/growthStage.js: n<3 всегда даёт null).
    await actionsApi.createWithQualities({
      name: 'Ran the kickoff', occurred_at: '2026-08-10', goal_id: goal.id,
      qualities: [{ quality_id: q.id, score: 4 }],
    })
    await actionsApi.createWithQualities({
      name: 'Closed the deal', occurred_at: '2026-08-15', goal_id: goal.id,
      qualities: [{ quality_id: q.id, score: 4 }],
    })
    await actionsApi.createWithQualities({
      name: 'Signed the contract', occurred_at: '2026-08-18', goal_id: goal.id,
      qualities: [{ quality_id: q.id, score: 4 }],
    })
    // Вне цели: одна оценка 1 -> общее среднее (4+4+4+1)/4 = 3.25, diff=+0.75 -> above_usual
    await actionsApi.createWithQualities({
      name: 'Unrelated slip', occurred_at: '2026-08-01',
      qualities: [{ quality_id: q.id, score: 1 }],
    })

    render(
      <Router initialEntries={[`/goals/${goal.id}`]}>
        <Routes><Route path="/goals/:id" element={<GoalDetailPage />} /></Routes>
      </Router>,
    )

    await screen.findByText('Lead the launch', {}, { timeout: 3000 })
    await screen.findByText('Closed the deal')
    expect(screen.getByText('Ran the kickoff')).toBeInTheDocument()
    expect(screen.queryByText('Unrelated slip')).not.toBeInTheDocument() // не эта цель

    expect(screen.getByText(/Gem/i)).toBeInTheDocument() // growthStage(4.0) -- именованная стадия, не голое число
    expect(screen.getByText(/above usual/i)).toBeInTheDocument() // только в баннере-заголовке: в списке эта же плашка подавлена для качества-заголовка, чтобы не дублировать
  })
})
