import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { actionsApi, goalsApi, qualitiesApi } from '../api/resources'
import { get } from '../api/client'
import { ErrorBanner } from '../components/Feedback'
import QualityPicker from '../components/QualityPicker'
import RatingControl from '../components/RatingControl'

const today = () => new Date().toISOString().slice(0, 10)

export default function LogActionPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [occurredAt, setOccurredAt] = useState(today())
  const [goalId, setGoalId] = useState('')
  const [contextId, setContextId] = useState('')
  const [goals, setGoals] = useState([])
  const [contexts, setContexts] = useState([])
  const [myQualities, setMyQualities] = useState([])
  const [picking, setPicking] = useState(false)

  // Выбранные качества этого действия: ТОЛЬКО то, что пользователь явно
  // добавил. Значение оценки -- null, пока не нажата конкретная кнопка
  // RatingControl -- никакого предзаполненного нуля.
  const [selected, setSelected] = useState([]) // [{userQualityId, name, score: null|0-4, comment}]

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([goalsApi.list(), get('/reference/action-contexts'), qualitiesApi.list()])
      .then(([g, c, q]) => { setGoals(g); setContexts(c); setMyQualities(q) })
      .catch(setError)
  }, [])

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
  const allRated = selected.length === 0 || selected.every((s) => s.score !== null)
  const canSave = name.trim().length > 0 && allRated && !saving

  async function save() {
    setError(null)
    setSaving(true)
    try {
      await actionsApi.createWithQualities({
        name: name.trim(),
        occurred_at: occurredAt,
        goal_id: goalId || null,
        context_id: contextId ? Number(contextId) : null,
        qualities: selected.map((s) => ({ quality_id: s.userQualityId, score: s.score, comment: s.comment || null })),
      })
      navigate('/', { replace: true })
    } catch (e) {
      setError(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="screen">
      <h1>{t('action.new')}</h1>
      <ErrorBanner error={error} />

      <div className="field">
        <label>{t('action.whatHappened')}</label>
        <textarea value={name} onChange={(e) => setName(e.target.value)} placeholder={t('action.namePlaceholder')} />
      </div>

      <div className="field">
        <label>{t('action.date')}</label>
        <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
      </div>

      <div className="field">
        <label>{t('action.goal')}</label>
        <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
          <option value="">—</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.path || g.name}</option>)}
        </select>
      </div>

      <div className="field">
        <label>{t('action.context')}</label>
        <select value={contextId} onChange={(e) => setContextId(e.target.value)}>
          <option value="">—</option>
          {contexts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>

      <h3>{t('action.qualitiesShown')}</h3>
      <p style={{ fontSize: '0.85rem' }}>{t('action.rateHint')}</p>

      {selected.length === 0 && <p className="empty-state" style={{ padding: 'var(--space-4)' }}>{t('action.noneSelectedYet')}</p>}

      {selected.map((s) => (
        <div key={s.userQualityId} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>{s.name}</strong>
            <button className="btn btn-secondary" style={{ width: 'auto', padding: '2px 10px' }} onClick={() => removeQuality(s.userQualityId)}>✕</button>
          </div>
          <RatingControl value={s.score} onChange={(score) => setScore(s.userQualityId, score)} />
        </div>
      ))}

      {picking ? (
        <QualityPicker
          myQualities={myQualities}
          excludeIds={excludeIds}
          onPick={addQuality}
          onAdopted={(q) => setMyQualities((prev) => [...prev, q])}
        />
      ) : (
        <button className="btn btn-secondary" onClick={() => setPicking(true)}>{t('action.addQuality')}</button>
      )}

      <button className="btn btn-primary" style={{ marginTop: 20 }} disabled={!canSave} onClick={save}>
        {saving ? t('common.loading') : t('action.save')}
      </button>
    </div>
  )
}
