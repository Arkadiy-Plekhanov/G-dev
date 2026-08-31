import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { mintSession, setSession } from '../test/helpers'
import { goalsApi, cyclesApi, reflectionsApi } from '../api/resources'
import ReflectionFormPage from './ReflectionFormPage'
import ReflectionDetailPage from './ReflectionDetailPage'

beforeEach(() => {
  localStorage.clear()
  setSession(mintSession())
})

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reflections/new" element={<ReflectionFormPage />} />
        <Route path="/reflections/:id" element={<ReflectionDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Reflections — type and binding follow the entry point, against the real backend', () => {
  it('entering with no params (home) offers only the three daily fields, and saves as daily with no goal/cycle', async () => {
    const user = userEvent.setup()
    renderAt('/reflections/new')

    expect(screen.getByText(/What worked\?/i)).toBeInTheDocument()
    expect(screen.getByText(/What didn't work\?/i)).toBeInTheDocument()
    expect(screen.getByText(/^Insight$/i)).toBeInTheDocument()
    // Еженедельные/по-циклу поля НЕ должны быть на экране при входе с главной.
    expect(screen.queryByText(/What to change/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/What stuck/i)).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/What went well/i), 'Stayed calm under pressure')
    await user.click(screen.getByRole('button', { name: /Save reflection/i }))

    await screen.findByText('Stayed calm under pressure')
    const mine = await reflectionsApi.list()
    expect(mine[0].reflection_type_code).toBe('daily')
    expect(mine[0].goal_id).toBeNull()
    expect(mine[0].cycle_id).toBeNull()
  })

  it('entering from a season (cycle_id in the URL) shows all seven fields and saves bound to that season, type not chosen by the user', async () => {
    const user = userEvent.setup()
    const season = await cyclesApi.create({ name: 'Reflection season' })

    renderAt(`/reflections/new?cycle_id=${season.id}`)

    // Тип и привязка не выбираются вручную -- на экране нет никакого
    // селектора типа, только контекстная подпись.
    expect(screen.queryByRole('combobox', { name: /type/i })).not.toBeInTheDocument()
    expect(screen.getByText(/What stuck/i)).toBeInTheDocument()
    expect(screen.getByText(/For next season/i)).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/one thing worth remembering/i), 'Consistency mattered more than intensity')
    await user.click(screen.getByRole('button', { name: /Save reflection/i }))

    await screen.findByText('Consistency mattered more than intensity')
    const mine = await reflectionsApi.list()
    const saved = mine.find((r) => r.cycle_id === season.id)
    expect(saved.reflection_type_code).toBe('cycle')
  })

  it('cannot save with every field left empty', async () => {
    renderAt('/reflections/new')
    const saveButton = screen.getByRole('button', { name: /Save reflection/i })
    expect(saveButton.disabled).toBe(true)
  })
})
