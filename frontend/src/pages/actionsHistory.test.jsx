import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { mintSession, setSession } from '../test/helpers'
import { actionsApi } from '../api/resources'
import ActionsHistoryPage from './ActionsHistoryPage'

beforeEach(() => {
  localStorage.clear()
  setSession(mintSession())
})

describe('ActionsHistoryPage — cursor pagination, against the real backend', () => {
  it('groups real actions by day and pages in a second real batch on "Show more", not an infinite scroll', async () => {
    const user = userEvent.setup()
    // 21 действий на одну дату -- ровно на одно больше первой страницы
    // (PAGE_SIZE=20), чтобы гарантированно потребовалась вторая загрузка.
    for (let i = 0; i < 21; i++) {
      await actionsApi.createWithQualities({ name: `Action ${i}`, occurred_at: '2026-08-01', qualities: [] })
    }

    render(<MemoryRouter><ActionsHistoryPage /></MemoryRouter>)

    await screen.findByText('2026-08-01')
    expect(screen.getAllByText(/^Action \d+$/).length).toBe(20)

    const more = screen.getByRole('button', { name: /Show more/i })
    await user.click(more)

    // Ждать надо "Action 0", НЕ "Action 20": все 21 действие имеют одну
    // дату, поэтому порядок -- created_at DESC, то есть "Action 20"
    // (созданное последним) стоит ПЕРВЫМ на первой странице и находится
    // мгновенно, ничего не дожидаясь. На второй странице реально только
    // одно действие -- самое старое, "Action 0". Ожидание не того элемента
    // делало проверку гонкой: на быстром бэкенде вторая страница успевала
    // приехать до подсчёта, на медленном (Docker) -- нет, и тест падал
    // с "expected 20 to be 21" на ровном месте.
    await screen.findByText('Action 0')
    await waitFor(() => {
      expect(screen.getAllByText(/^Action \d+$/).length).toBe(21)
    })
    // Дошли до конца -- кнопки больше нет вообще, это не бесконечная лента.
    expect(screen.queryByRole('button', { name: /Show more/i })).not.toBeInTheDocument()
  })
})
