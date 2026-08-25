/**
 * Оценка 0-4 качества в конкретном действии.
 *
 * Намеренно НЕ слайдер и без предвыбранного значения: в исходном
 * дизайн-концепте слайдеры стояли на 0 по умолчанию для всех качеств
 * фокуса, из-за чего в БД записывались ложные нули для качеств, которые
 * пользователь вообще не имел в виду. Здесь value может быть null
 * (ничего не нажато) -- это единственно корректное "ещё не оценено".
 *
 * 0 нарисован отдельно от 1-4: по канонической семантике 0 не "низший
 * балл на общей шкале", а качественно другое состояние -- "качество было
 * уместно, но проявилось в обратную сторону". 1-4 -- нарастающая
 * интенсивность положительного проявления.
 */
export default function RatingControl({ value, onChange }) {
  return (
    <div className="rating-row" role="radiogroup" aria-label="Rate 0 to 4">
      <button
        type="button"
        className={`rating-zero${value === 0 ? ' selected' : ''}`}
        role="radio"
        aria-checked={value === 0}
        aria-label="0 — showed up in reverse"
        onClick={() => onChange(0)}
      >
        0
      </button>
      {[1, 2, 3, 4].map((level) => (
        <button
          key={level}
          type="button"
          data-level={level}
          className={`rating-dot${value === level ? ' selected' : ''}`}
          role="radio"
          aria-checked={value === level}
          aria-label={`${level}`}
          onClick={() => onChange(level)}
        >
          {level}
        </button>
      ))}
    </div>
  )
}
