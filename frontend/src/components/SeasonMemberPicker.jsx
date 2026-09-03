import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { growthStage } from '../lib/growthStage'

/**
 * Выбор целей или качеств для сезона -- карточками с кнопкой «+», как на
 * странице качеств и в онбординге. Раньше здесь были чекбоксы: единственное
 * место в приложении с такой механикой.
 *
 * ВАЖНО про смысл «+» здесь. На странице качеств «+» означает «в фокус» --
 * состояние глобальное и сегодняшнее. Здесь «+» означает «в этот сезон» --
 * состояние локальное и на весь период. Это РАЗНЫЕ, независимые состояния,
 * и так и задумано: сезон -- длинный период, внутри которого фокус меняется
 * посменно. Качество, привязанное к сезону, но убранное из фокуса сегодня --
 * нормальное состояние, а не противоречие. Поэтому кнопка здесь одна и
 * управляет только принадлежностью к сезону; текущий фокус показан
 * подписью, чтобы оба состояния было видно, но не перепутать.
 *
 * items: [{ id, label, sub, inFocus }] -- готовые к отрисовке строки,
 * чтобы компонент не знал, цели это или качества.
 */
export default function SeasonMemberPicker({ items, selectedIds, onToggle, searchPlaceholder, emptyText }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = items.filter((i) => !q || i.label.toLowerCase().includes(q))
    // Выбранные -- наверх: их состав и есть смысл этой формы.
    return [
      ...matched.filter((i) => selectedIds.has(i.id)),
      ...matched.filter((i) => !selectedIds.has(i.id)),
    ]
  }, [items, selectedIds, query])

  if (items.length === 0) return <p className="eyebrow">{emptyText}</p>

  return (
    <>
      <input
        type="text"
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', padding: 10, border: '1px solid var(--line)', borderRadius: 6, marginBottom: 8 }}
      />
      {visible.length === 0 && <p className="eyebrow">{t('action.noQualityMatches')}</p>}
      {visible.map((i) => {
        const picked = selectedIds.has(i.id)
        return (
          <div key={i.id} className="card stat-row stat-row--action">
            <div className="stat-row-name">
              <div>{i.label}</div>
              {i.sub && <span className="eyebrow">{i.sub}</span>}
            </div>
            <button
              type="button"
              className={picked ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ width: 'auto', flexShrink: 0 }}
              onClick={() => onToggle(i.id)}
              aria-label={picked ? t('seasons.removeFromSeason') : t('seasons.addToSeason')}
            >
              {picked ? '✓' : '+'}
            </button>
          </div>
        )
      })}
    </>
  )
}
