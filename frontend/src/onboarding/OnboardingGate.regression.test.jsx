import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { OnboardingGate } from '../App'
import { useMarkOnboarded } from './OnboardingContext'
import * as resources from '../api/resources'

beforeEach(() => {
  vi.restoreAllMocks()
})

/** Найдено ручным тестированием (не выдумано заранее): после адопции качеств
 * пользователя отправляло обратно на онбординг, и это чинилось только полной
 * перезагрузкой страницы. Причина: hasQualities проверяется один раз при
 * монтировании OnboardingGate и остаётся "false" (уже настоящего для нового
 * пользователя) вплоть до размонтирования компонента -- клиентская навигация
 * (navigate('/')) его не размонтирует, поэтому застрявшее "false" продолжало
 * редиректить обратно на /onboarding даже после успешной адопции. */

function Fake() {
  const markOnboarded = useMarkOnboarded()
  return <button onClick={markOnboarded}>simulate adopt</button>
}

describe('OnboardingGate — regression for the redirect-loop found in manual testing', () => {
  it('without markOnboarded: stays stuck redirecting to /onboarding even after qualities exist server-side (the bug, reproduced)', async () => {
    vi.spyOn(resources.qualitiesApi, 'list').mockResolvedValue([]) // как видит его гейт при первом монтировании
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <OnboardingGate>
          <Routes>
            <Route path="/onboarding" element={<div>onboarding screen</div>} />
            <Route path="/" element={<div>home screen</div>} />
          </Routes>
        </OnboardingGate>
      </MemoryRouter>,
    )
    expect(await screen.findByText('onboarding screen')).toBeInTheDocument()
    // hasQualities намеренно НЕ перепроверяется здесь -- это и есть то самое
    // "застрявшее" состояние, которое раньше ловило пользователя в петле.
  })

  it('with markOnboarded called: the SAME mounted gate immediately stops redirecting, no reload needed (the fix)', async () => {
    vi.spyOn(resources.qualitiesApi, 'list').mockResolvedValue([]) // при монтировании -- честно ноль качеств у нового пользователя
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <OnboardingGate>
          <Routes>
            <Route path="/onboarding" element={<Fake />} />
          </Routes>
        </OnboardingGate>
      </MemoryRouter>,
    )
    await screen.findByText('simulate adopt')
    await user.click(screen.getByText('simulate adopt')) // эквивалент markOnboarded(), который теперь реально вызывают IdealPage/ManualPage

    // Гейт тот же самый смонтированный экземпляр -- не было ни одного нового
    // запроса qualitiesApi.list(), только локальное обновление состояния.
    expect(resources.qualitiesApi.list).toHaveBeenCalledTimes(1)
  })

  it('/qualities/... is exempt from the onboarding redirect even with zero qualities -- clicking a catalog quality during selection must not bounce back to "Who do you want to become" (found via manual testing)', async () => {
    vi.spyOn(resources.qualitiesApi, 'list').mockResolvedValue([]) // ещё ничего не принято -- ровно момент выбора в онбординге
    render(
      <MemoryRouter initialEntries={['/qualities/some-catalog-quality-id']}>
        <OnboardingGate>
          <Routes>
            <Route path="/qualities/:id" element={<div>quality card</div>} />
            <Route path="/onboarding" element={<div>onboarding screen</div>} />
          </Routes>
        </OnboardingGate>
      </MemoryRouter>,
    )
    expect(await screen.findByText('quality card')).toBeInTheDocument()
    expect(screen.queryByText('onboarding screen')).not.toBeInTheDocument()
  })
})
