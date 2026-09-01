import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { mintSession, setSession } from '../test/helpers'
import { goalsApi, cyclesApi, qualitiesApi, catalogApi } from '../api/resources'
import ReflectionFormPage from './ReflectionFormPage'
import ReflectionDetailPage from './ReflectionDetailPage'

beforeEach(async () => {
  localStorage.clear()
  setSession(mintSession())
})

async function adoptFocusQuality() {
  const catalog = await catalogApi.qualities()
  return qualitiesApi.adopt({ catalog_quality_id: catalog[0].id, focus_code: 'current_focus' })
}

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

    // Проверяем то, что реально видит пользователь на отрисованной
    // карточке -- не отдельным сайд-каналом через reflectionsApi.list().
    // ReflectionDetailPage сама делает GET по id из URL той же RLS-схемой,
    // что и list() -- если бы список расходился с единичным чтением, это
    // был бы баг самого бэкенда, а не теста; но раз карточка отрисовалась
    // с текстом, единичное чтение точно работает, и проверять стоит
    // именно его. Без привязки (daily) ссылка "назад" ведёт на общий
    // список рефлексий -- это и есть наблюдаемое доказательство
    // goal_id/cycle_id === null, без отдельного запроса.
    await screen.findByText('Stayed calm under pressure')
    // findBy, не getBy: ReflectionDetailPage может на мгновение перерисоваться
    // обратно в состояние загрузки между кадрами (лишний ре-рендер эффекта
    // с тем же id) -- синхронный getBy иногда ловит именно этот кадр.
    const backLink = await screen.findByText(/^← Back$/i)
    expect(backLink.closest('a')).toHaveAttribute('href', '/reflections')
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
    const backLink = await screen.findByText(/^← Back$/i)
    expect(backLink.closest('a')).toHaveAttribute('href', `/cycles/${season.id}`)
  })

  it('cannot save with every field left empty', async () => {
    renderAt('/reflections/new')
    const saveButton = screen.getByRole('button', { name: /Save reflection/i })
    expect(saveButton.disabled).toBe(true)
  })

  it('§1: rating a focus quality atomically creates a linked action, shown on the reflection\'s own card the same way ActionDetailPage shows it', async () => {
    const user = userEvent.setup()
    const quality = await adoptFocusQuality()

    renderAt('/reflections/new')
    // Качество в фокусе видно сразу тапом, тот же паттерн, что и в
    // LogActionPage (§5 обратной связи) -- не нужно открывать поиск.
    await user.click(await screen.findByText(`+ ${quality.name.en}`))
    await user.click(screen.getByRole('radio', { name: /Flame/i }))
    await user.click(screen.getByRole('button', { name: /Save reflection/i }))

    // Сохранение прошло -- редирект на карточку рефлексии, и там уже
    // видно качество из АВТОМАТИЧЕСКИ созданного действия, не только
    // текстовые поля рефлексии. waitFor, не разовый find + синхронная
    // проверка сразу следом: два отдельных async-эффекта (reflection,
    // затем expressions+qualityNames) иногда дают кадр, где findByText
    // ловит узел до того, как оба состояния устаканились вместе --
    // проверка должна повторяться целиком, а не полагаться на то, что
    // между find и следующей строкой дерево не успеет измениться.
    await waitFor(() => {
      const qualityRow = screen.getByText(quality.name.en)
      expect(qualityRow.closest('a')).toHaveAttribute('href', `/qualities/${quality.id}`)
    })
    expect(screen.getByText('Flame')).toBeInTheDocument()
  })
})
