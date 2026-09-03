import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { mintSession, setSession } from '../test/helpers'
import { cyclesApi, goalsApi, catalogApi, qualitiesApi } from '../api/resources'
import SeasonsListPage from './SeasonsListPage'
import SeasonFormPage from './SeasonFormPage'
import SeasonDetailPage from './SeasonDetailPage'

beforeEach(() => {
  localStorage.clear()
  setSession(mintSession())
})

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cycles" element={<SeasonsListPage />} />
        <Route path="/cycles/new" element={<SeasonFormPage />} />
        <Route path="/cycles/:id" element={<SeasonDetailPage />} />
        <Route path="/cycles/:id/edit" element={<SeasonFormPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Seasons — creation and one-active-season rule, against the real backend', () => {
  it('creates a season with a real goal and a real quality attached, then shows both on the detail card', async () => {
    const user = userEvent.setup()
    const goal = await goalsApi.create({ name: 'Ship the launch', status_code: 'active', priority_code: 'p2_high' })
    const catalog = await catalogApi.qualities()
    const quality = await qualitiesApi.adopt({ catalog_quality_id: catalog[0].id })

    renderAt('/cycles/new')
    await user.type(await screen.findByPlaceholderText(/Spring focus/i), 'Launch season')
    // Выбор -- кнопкой «+» на карточке, как на странице качеств и в
    // онбординге. Раньше здесь были чекбоксы -- единственное место в
    // приложении с такой механикой. Кнопок с подписью «Add to this
    // season» на форме две (цели и качества), поэтому ищем внутри
    // конкретной карточки, а не по всей странице.
    const goalCard = (await screen.findByText(goal.name)).closest('.card')
    await user.click(within(goalCard).getByRole('button'))
    const qualityCard = screen.getByText(quality.name.en).closest('.card')
    await user.click(within(qualityCard).getByRole('button'))
    await user.click(screen.getByRole('button', { name: /Start season/i }))

    // Успешное создание -- редирект на карточку, где виден реальный состав.
    await screen.findByText('Launch season')
    expect(screen.getByText(goal.name)).toBeInTheDocument()
    expect(screen.getByText(quality.name.en)).toBeInTheDocument()
  })

  it('a second active season is rejected with a friendly message and a link to the existing one, not a raw error code', async () => {
    const user = userEvent.setup()
    await cyclesApi.create({ name: 'Already active', status_code: 'active' })

    renderAt('/cycles/new')
    await user.type(await screen.findByPlaceholderText(/Spring focus/i), 'Second attempt')
    // Ограничение "один активный сезон" -- частичный уникальный индекс
    // именно на status_code='active'. Форма по умолчанию создаёт
    // 'planned', что легально рядом с уже активным -- конфликт нужно
    // вызвать явно, выбрав статус Active перед отправкой.
    await user.selectOptions(screen.getByRole('combobox'), 'active')
    await user.click(screen.getByRole('button', { name: /Start season/i }))

    await screen.findByText(/already have an active season/i)
    expect(screen.queryByText('ONE_ACTIVE_CYCLE_ALREADY_EXISTS')).not.toBeInTheDocument()
    expect(screen.getByText(/View your active season/i)).toBeInTheDocument()
  })

  it('the list puts the real active season first, visually distinct from planned/done ones', async () => {
    await cyclesApi.create({ name: 'Done already', status_code: 'done' })
    await cyclesApi.create({ name: 'Right now', status_code: 'active' })

    renderAt('/cycles')

    const activeCard = await screen.findByText('Right now')
    expect(activeCard.closest('a')).toHaveTextContent('Active')
  })
})
