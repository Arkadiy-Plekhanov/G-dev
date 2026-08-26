import { createContext, useContext } from 'react'

/** Позволяет странице онбординга сообщить OnboardingGate "я только что
 * успешно добавил(а) качества" сразу, без повторного похода в API. В
 * отдельном файле (не в App.jsx), чтобы IdealPage/ManualPage могли
 * импортировать это без циклической зависимости App.jsx -> страницы
 * онбординга -> App.jsx. */
export const OnboardingStatusContext = createContext(() => {})

export function useMarkOnboarded() {
  return useContext(OnboardingStatusContext)
}
