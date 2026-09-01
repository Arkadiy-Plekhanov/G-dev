/**
 * Порядок и подписи содержательных полей рефлексии -- ключи из ReflectionOut
 * -> i18n-ключ подписи. Общий модуль для ReflectionDetailPage (карточка
 * одной рефлексии) и ReflectionsListPage (§13: список должен показывать
 * ПОЛНЫЙ текст, а не одно усечённое поле -- чтение подряд по списку и есть
 * сам смысл рефлексии, по обратной связи с реального использования) --
 * раньше список полей был задан только внутри карточки, и список бы
 * незаметно разошёлся с ней при первой же правке одного из двух мест.
 */
export const REFLECTION_FIELDS = [
  ['what_worked', 'reflections.whatWorked'],
  ['what_did_not_work', 'reflections.whatDidNotWork'],
  ['qualities_observed_raw', 'reflections.qualitiesObserved'],
  ['insight', 'reflections.insight'],
  ['what_to_change', 'reflections.whatToChange'],
  ['what_stuck', 'reflections.whatStuck'],
  ['next_cycle_change', 'reflections.nextCycleChange'],
]
