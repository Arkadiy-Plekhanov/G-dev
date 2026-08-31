import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { reflectionsApi } from '../api/resources'
import { ErrorBanner } from '../components/Feedback'

const today = () => new Date().toISOString().slice(0, 10)

/** §2.2/§2.3: тип и привязка определяются ТОЧКОЙ ВХОДА (query-параметры
 * goal_id/cycle_id), пользователь их не выбирает вручную. Без параметров --
 * ежедневная (вход с главной). С cycle_id -- по циклу, все семь полей.
 * С goal_id -- по умолчанию weekly (промежуточный набор полей): у цели
 * нет своего типа в доменной модели, а еженедельный охват -- разумный
 * дефолт для рефлексии, привязанной к конкретной цели, а не ко дню.
 *
 * Прогрессивное раскрытие, не стена из семи полей сразу -- всё
 * необязательно, сохранить можно заполнив хоть одно. */
export default function ReflectionFormPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const goalId = params.get('goal_id')
  const cycleId = params.get('cycle_id')
  const type = cycleId ? 'cycle' : (goalId ? 'weekly' : 'daily')

  const [fields, setFields] = useState({
    what_worked: '', what_did_not_work: '', qualities_observed_raw: '', insight: '',
    what_to_change: '', what_stuck: '', next_cycle_change: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const hasAnyContent = Object.values(fields).some((v) => v.trim().length > 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      occurred_at: today(),
      reflection_type_code: type,
      goal_id: goalId || null,
      cycle_id: cycleId || null,
      ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim() || null])),
    }
    try {
      const result = await reflectionsApi.create(payload)
      navigate(`/reflections/${result.id}`, { replace: true })
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  const backTo = cycleId ? `/cycles/${cycleId}` : (goalId ? `/goals/${goalId}` : '/reflections')

  return (
    <div className="screen">
      <Link to={backTo} style={{ fontSize: '0.85rem' }}>← {t('common.back')}</Link>
      <h1>{t('reflections.new')}</h1>
      <p className="eyebrow">
        {cycleId ? t('reflections.aboutSeason') : goalId ? t('reflections.aboutGoal') : t(`reflections.type${type.charAt(0).toUpperCase()}${type.slice(1)}`)}
      </p>

      <ErrorBanner error={error} />

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>{t('reflections.whatWorked')}</label>
          <textarea value={fields.what_worked} onChange={(e) => setField('what_worked', e.target.value)} placeholder={t('reflections.whatWorkedPlaceholder')} />
        </div>
        <div className="field">
          <label>{t('reflections.whatDidNotWork')}</label>
          <textarea value={fields.what_did_not_work} onChange={(e) => setField('what_did_not_work', e.target.value)} placeholder={t('reflections.whatDidNotWorkPlaceholder')} />
        </div>
        <div className="field">
          <label>{t('reflections.insight')}</label>
          <textarea value={fields.insight} onChange={(e) => setField('insight', e.target.value)} placeholder={t('reflections.insightPlaceholder')} />
        </div>

        {(type === 'weekly' || type === 'cycle') && (
          <>
            <div className="field">
              <label>{t('reflections.qualitiesObserved')}</label>
              <textarea value={fields.qualities_observed_raw} onChange={(e) => setField('qualities_observed_raw', e.target.value)} placeholder={t('reflections.qualitiesObservedPlaceholder')} />
            </div>
            <div className="field">
              <label>{t('reflections.whatToChange')}</label>
              <textarea value={fields.what_to_change} onChange={(e) => setField('what_to_change', e.target.value)} placeholder={t('reflections.whatToChangePlaceholder')} />
            </div>
          </>
        )}

        {type === 'cycle' && (
          <>
            <div className="field">
              <label>{t('reflections.whatStuck')}</label>
              <textarea value={fields.what_stuck} onChange={(e) => setField('what_stuck', e.target.value)} placeholder={t('reflections.whatStuckPlaceholder')} />
            </div>
            <div className="field">
              <label>{t('reflections.nextCycleChange')}</label>
              <textarea value={fields.next_cycle_change} onChange={(e) => setField('next_cycle_change', e.target.value)} placeholder={t('reflections.nextCycleChangePlaceholder')} />
            </div>
          </>
        )}

        {!hasAnyContent && <p className="eyebrow">{t('reflections.atLeastOneField')}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving || !hasAnyContent} style={{ width: '100%' }}>
          {saving ? t('common.loading') : t('reflections.save')}
        </button>
      </form>
    </div>
  )
}
