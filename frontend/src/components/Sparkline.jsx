/**
 * Минимальный инлайн-график динамики -- для карточки качества (§4.1
 * спецификации Фазы 1: "спарклайн динамики по проявлениям во времени").
 *
 * Сознательно не библиотека (recharts и т.п.) -- десяток точек не требует
 * тяжёлого рендерера, а чистый SVG проще держать в духе "полевого дневника"
 * (тонкая линия, никакой хромированной инфографики). Растёт линия вверх —
 * растёт качество; читается интуитивно без легенды.
 *
 * points: [{score: number}], в хронологическом порядке (старое -> новое).
 * Меньше двух точек -- линию рисовать не из чего, компонент возвращает null,
 * а не плоскую/сломанную картинку.
 */
export default function Sparkline({ points, height = 40, width = 200 }) {
  const scores = points.map((p) => p.score).filter((s) => s !== null && s !== undefined)
  if (scores.length < 2) return null

  const min = Math.min(...scores, 1)
  const max = Math.max(...scores, 4)
  const range = max - min || 1
  const stepX = width / (scores.length - 1)

  const coords = scores.map((s, i) => {
    const x = i * stepX
    const y = height - ((s - min) / range) * (height - 6) - 3
    return [x, y]
  })
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const lastPoint = coords[coords.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke="var(--growth)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="2.5" fill="var(--growth)" />
    </svg>
  )
}
