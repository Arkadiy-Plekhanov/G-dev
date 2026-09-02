/**
 * Превращает ряд оценок из API в точки для <Sparkline>.
 *
 * API отдаёт recent_scores новыми ВПЕРЁД (так эффективнее выбирать
 * последние N в SQL), а линия должна читаться слева направо как течение
 * времени -- поэтому разворачиваем здесь, в одном месте, а не на каждом
 * экране по-своему.
 *
 * MIN_POINTS = 3 сознательно: по двум точкам спарклайн -- всегда прямая
 * линия. Она выглядит как информация, не будучи ею, а мы только что
 * убирали «not enough data yet» ровно за то, что он захламлял экран
 * пустотой. Ниже порога не показываем ничего.
 */
export const MIN_SPARKLINE_POINTS = 3

export function sparklinePoints(recentScores) {
  if (!recentScores || recentScores.length < MIN_SPARKLINE_POINTS) return null
  return [...recentScores].reverse().map((score) => ({ score }))
}
