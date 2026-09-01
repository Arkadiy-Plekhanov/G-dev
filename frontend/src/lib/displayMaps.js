/**
 * Общие карты «код из БД → ключ i18n / класс» для всего приложения.
 *
 * Появились потому, что одни и те же карты были размножены по страницам:
 * SCORE_KEY в трёх файлах, TYPE_KEY в двух, TREND_ARROW в двух, а класс
 * тренда вычислялся ТРЕМЯ разными способами (инлайн-тернарник в
 * QualityDetailPage, карта BASELINE в GoalDetailPage, карта TREND_CLASS
 * в HomePage). Это уже кусалось на практике: когда шкала переименовалась
 * в Spark/Kindling/Flame/Gem, нужно было не забыть про каждое из трёх
 * мест -- ровно тот класс ошибки, который тихо расходится и вылезает
 * потом на живом экране.
 *
 * Правило: любая карта, которую читают ДВА и более экрана, живёт здесь,
 * а не копируется в файл страницы.
 */

/** score (0-4) -> ключ i18n ступени шкалы роста. 0 -- вне шкалы роста
 *  («пошло в другую сторону»), не низшая ступень: см. миграцию 10. */
export const SCORE_KEY = { 0: 'inverted', 1: 'spark', 2: 'kindling', 3: 'flame', 4: 'gem' }

/** reflection_type_code -> ключ i18n подписи типа. */
export const REFLECTION_TYPE_KEY = {
  daily: 'reflections.typeDaily',
  weekly: 'reflections.typeWeekly',
  goal: 'reflections.typeGoal',
  cycle: 'reflections.typeCycle',
}

/** trend (машинный код из quality_stats) -> стрелка и CSS-класс.
 *  Один источник вместо трёх разных способов вычисления. */
export const TREND_ARROW = { rising: '↗', declining: '↘', steady: '→' }
export const TREND_CLASS = { rising: 'trend-up', declining: 'trend-down', steady: 'trend-flat' }

/** vs_baseline (сравнение внутри цели с обычным уровнем качества) ->
 *  ключ i18n, стрелка, CSS-класс и цветовая переменная -- те же коды,
 *  что и у тренда, но другой смысл (не «меняется во времени», а «здесь
 *  против обычного»). colorVar здесь, а не тернарником на месте: цвет --
 *  часть той же самой семантики «лучше/хуже/как обычно», и держать его
 *  отдельно от неё значит позволить им разойтись. */
export const BASELINE = {
  above_usual: { key: 'goals.aboveUsual', trendClass: 'trend-up', arrow: '↗', colorVar: '--growth' },
  below_usual: { key: 'goals.belowUsual', trendClass: 'trend-down', arrow: '↘', colorVar: '--brick' },
  as_usual: { key: 'goals.asUsual', trendClass: 'trend-flat', arrow: '→', colorVar: '--line' },
}
