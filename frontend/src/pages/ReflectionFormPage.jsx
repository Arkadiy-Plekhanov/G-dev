import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { reflectionsApi, qualitiesApi } from '../api/resources'
import { ErrorBanner } from '../components/Feedback'
import QualityPicker from '../components/QualityPicker'
import RatingControl from '../components/RatingControl'

const today = () => new Date().toISOString().slice(0, 10)

/** §2.2/§2.3: тип определяется точкой входа как ДЕФОЛТ, но не жёстко для
 * всех случаев -- §2-3 обратной связи: "можно ведь одновременно - по
 * точке входа и выбор на самом экране... И Goal рефлексия - привязанная
 * к точке входа". goal/cycle ВСЕГДА жёстко привязаны к точке входа (без
 * реальной цели/сезона эти типы просто бессмысленны -- нечему
 * принадлежать), а daily/weekly самодостаточны и переключаются вручную,
 * когда пришли без контекста (мягкий переход, видимые опции рядом с
 * заголовком).
 *
 * Прогрессивное раскрытие, не стена из семи полей сразу -- всё
 * необязательно, сохранить можно заполнив хоть одно.
 *
 * §1 обратной связи: "рефлексия без качеств — отдельна, рефлексия с
 * указанием качеств — качества регистрируются с привязкой к действию".
 * Секция выбора качеств -- тот же компонент/паттерн, что в LogActionPage
 * (focus-чипы сразу видны + полный поиск по каталогу рядом), потому что
 * это буквально то же самое действие: "что произошло, какие качества
 * проявились" -- только выросшее изнутри формы рефлексии, а не отдельного
 * экрана логирования. */
export default function ReflectionFormPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const goalId = params.get('goal_id')
  const cycleId = params.get('cycle_id')
  const locked = Boolean(goalId || cycleId)
  const [type, setType] = useState(cycleId ? 'cycle' : (goalId ? 'goal' : 'daily'))

  const [fields, setFields] = useState({
    what_worked: '', what_did_not_work: '', qualities_observed_raw: '', insight: '',
    what_to_change: '', what_stuck: '', next_cycle_change: '',
  })
  const [myQualities, setMyQualities] = useState([])
  const [selected, setSelected] = useState([]) // [{userQualityId, name, score: null|0-4, comment}]
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    qualitiesApi.list().then(setMyQualities).catch(() => {})
  }, [])

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function addQuality(mq) {
    setSelected((prev) => [...prev, { userQualityId: mq.id, name: mq.name.en, score: null, comment: '' }])
    setPicking(false)
  }

  function removeQuality(userQualityId) {
    setSelected((prev) => prev.filter((s) => s.userQualityId !== userQualityId))
  }

  function setScore(userQualityId, score) {
    setSelected((prev) => prev.map((s) => (s.userQualityId === userQualityId ? { ...s, score } : s)))
  }

  const excludeIds = new Set(selected.map((s) => s.userQualityId))
  const focusQualities = myQualities.filter((q) => q.focus_code === 'current_focus' && !excludeIds.has(q.id))
  const allRated = selected.length === 0 || selected.every((s) => s.score !== null)
  const hasAnyContent = Object.values(fields).some((v) => v.trim().length > 0) || selected.length > 0

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
      qualities: selected.map((s) => ({ quality_id: s.userQualityId, score: s.score, comment: s.comment || null })),
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
      {locked ? (
        <p className="eyebrow">
          {cycleId ? t('reflections.aboutSeason') : t('reflections.aboutGoal')}
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['daily', 'weekly'].map((opt) => (
            <button
              key={opt}
              type="button"
              className={`pill pill--tappable${type === opt ? ' pill--gold' : ''}`}
              style={{ cursor: 'pointer', transition: 'background-color 0.15s ease, color 0.15s ease' }}
              onClick={() => setType(opt)}
            >
              {t(`reflections.type${opt.charAt(0).toUpperCase()}${opt.slice(1)}`)}
            </button>
          ))}
        </div>
      )}

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

        <div className="field">
          <label>{t('reflections.qualitiesShown')}</label>
          {selected.map((s) => (
            <div key={s.userQualityId} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>{s.name}</strong>
                <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '2px 10px' }} onClick={() => removeQuality(s.userQualityId)}>✕</button>
              </div>
              <RatingControl value={s.score} onChange={(score) => setScore(s.userQualityId, score)} />
            </div>
          ))}
          {focusQualities.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {focusQualities.map((q) => (
                <button key={q.id} type="button" className="pill pill--tappable" style={{ cursor: 'pointer' }} onClick={() => addQuality(q)}>
                  + {q.name.en}
                </button>
              ))}
            </div>
          )}
          {picking ? (
            <QualityPicker myQualities={myQualities} excludeIds={excludeIds} onPick={addQuality}
                           onAdopted={(q) => setMyQualities((prev) => [...prev, q])} />
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setPicking(true)}>{t('action.searchAllQualities')}</button>
          )}
        </div>

        {(type === 'weekly' || type === 'goal' || type === 'cycle') && (
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
        {!allRated && <p className="eyebrow">{t('action.rateHint')}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving || !hasAnyContent || !allRated} style={{ width: '100%' }}>
          {saving ? t('common.loading') : t('reflections.save')}
        </button>
      </form>
    </div>
  )
}
