import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Список качеств пользователя (myQualities, с user_quality_id) для выбора
 * в действие. Фокусные качества -- сверху, остальные -- ниже, поиск по
 * имени фильтрует оба блока. Уже выбранные (excludeIds) скрываются.
 */
export default function QualityPicker({ myQualities, excludeIds, onPick }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const { focus, rest } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const available = myQualities.filter((mq) => !excludeIds.has(mq.id))
    const matches = (mq) => !q || mq.name.en.toLowerCase().includes(q)
    return {
      focus: available.filter((mq) => mq.focus_code === 'current_focus' && matches(mq)),
      rest: available.filter((mq) => mq.focus_code !== 'current_focus' && matches(mq)),
    }
  }, [myQualities, excludeIds, query])

  return (
    <div className="card">
      <input
        type="text"
        placeholder={t('onboarding.manualSearch')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', padding: 10, border: '1px solid var(--line)', borderRadius: 6, marginBottom: 8 }}
      />
      {[...focus, ...rest].length === 0 && <p style={{ margin: '8px 0' }}>No matches.</p>}
      {focus.map((mq) => (
        <div key={mq.id} className="quality-search-result" onClick={() => onPick(mq)}>
          <span>{mq.name.en}</span>
          <span className="pill">focus</span>
        </div>
      ))}
      {rest.map((mq) => (
        <div key={mq.id} className="quality-search-result" onClick={() => onPick(mq)}>
          <span>{mq.name.en}</span>
        </div>
      ))}
    </div>
  )
}
