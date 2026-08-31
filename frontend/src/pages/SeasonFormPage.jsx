import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { cyclesApi, goalsApi, qualitiesApi } from '../api/resources'
import { get } from '../api/client'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

/** Общая форма для создания (/cycles/new) и редактирования (/cycles/:id/edit)
 * -- один компонент, режим определяется наличием :id в URL. Экономит
 * дублирование полей/валидации; расхождение только в заголовке, начальных
 * значениях и вызываемом методе API.
 *
 * §1.2, важная деталь API: PATCH заменяет goal_ids/quality_ids ЦЕЛИКОМ, не
 * дельтой -- поэтому при редактировании форма всегда шлёт полный текущий
 * набор отмеченных чекбоксов, а не только то, что изменилось. */
export default function SeasonFormPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [statusOptions, setStatusOptions] = useState([])
  const [goals, setGoals] = useState([])
  const [myQualities, setMyQualities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusCode, setStatusCode] = useState('planned')
  const [description, setDescription] = useState('')
  const [summary, setSummary] = useState('')
  const [goalIds, setGoalIds] = useState(new Set())
  const [qualityIds, setQualityIds] = useState(new Set())

  useEffect(() => {
    const base = [
      get('/reference/options/cycle_status'),
      goalsApi.list(),
      qualitiesApi.list(),
    ]
    Promise.all(isEdit ? [...base, cyclesApi.get(id)] : base)
      .then(([statuses, g, q, existing]) => {
        setStatusOptions(statuses)
        setGoals(g)
        setMyQualities(q)
        if (existing) {
          setName(existing.name)
          setStartDate(existing.start_date || '')
          setEndDate(existing.end_date || '')
          setStatusCode(existing.status_code)
          setDescription(existing.description || '')
          setSummary(existing.summary || '')
          setGoalIds(new Set(existing.goals.map((x) => x.id)))
          setQualityIds(new Set(existing.qualities.map((x) => x.id)))
        }
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [id, isEdit])

  function toggle(set, setSet, itemId) {
    const next = new Set(set)
    next.has(itemId) ? next.delete(itemId) : next.add(itemId)
    setSet(next)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      name,
      start_date: startDate || null,
      end_date: endDate || null,
      status_code: statusCode,
      description: description || null,
      summary: summary || null,
      goal_ids: [...goalIds],
      quality_ids: [...qualityIds],
    }
    try {
      const result = isEdit ? await cyclesApi.update(id, payload) : await cyclesApi.create(payload)
      navigate(`/cycles/${result.id}`)
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  if (loading) return <CenterLoading />

  // Попытка создать второй активный сезон: не сырая ошибка, а понятный
  // текст + прямой путь к уже существующему активному (§1.2, обязательное
  // требование спецификации).
  const isOneActiveConflict = error?.code === 'ONE_ACTIVE_CYCLE_ALREADY_EXISTS'

  return (
    <div className="screen">
      <Link to={isEdit ? `/cycles/${id}` : '/cycles'} style={{ fontSize: '0.85rem' }}>← {t('seasons.title')}</Link>
      <h1>{isEdit ? t('seasons.edit') : t('seasons.new')}</h1>

      {isOneActiveConflict ? (
        <div className="error-banner">
          {t('errors.ONE_ACTIVE_CYCLE_ALREADY_EXISTS')}
          <Link to="/cycles" className="btn btn-secondary" style={{ display: 'block', marginTop: 8, textAlign: 'center', textDecoration: 'none' }}>
            {t('seasons.viewActive')}
          </Link>
        </div>
      ) : (
        <ErrorBanner error={error} />
      )}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>{t('seasons.nameLabel')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('seasons.namePlaceholder')} required maxLength={300} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>{t('seasons.startDate')}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('seasons.endDate')}</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>{t('seasons.status')}</label>
          <select value={statusCode} onChange={(e) => setStatusCode(e.target.value)}>
            {statusOptions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </div>

        <div className="field">
          <label>{t('seasons.description')}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('seasons.descriptionPlaceholder')} />
        </div>

        {isEdit && (
          <div className="field">
            <label>{t('seasons.summary')}</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={t('seasons.summaryPlaceholder')} />
          </div>
        )}

        <div className="field">
          <label>{t('seasons.goals')}</label>
          {goals.length === 0 && <p className="eyebrow">{t('seasons.noneSelected')}</p>}
          {goals.map((g) => (
            <label key={g.id} className="checkbox-row">
              <input type="checkbox" checked={goalIds.has(g.id)} onChange={() => toggle(goalIds, setGoalIds, g.id)} />
              {g.name}
            </label>
          ))}
        </div>

        <div className="field">
          <label>{t('seasons.qualities')}</label>
          {myQualities.length === 0 && <p className="eyebrow">{t('seasons.noneSelected')}</p>}
          {myQualities.map((q) => (
            <label key={q.id} className="checkbox-row">
              <input type="checkbox" checked={qualityIds.has(q.id)} onChange={() => toggle(qualityIds, setQualityIds, q.id)} />
              {q.name.en}
            </label>
          ))}
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()} style={{ width: '100%' }}>
          {saving ? t('common.loading') : (isEdit ? t('seasons.save') : t('seasons.create'))}
        </button>
      </form>
    </div>
  )
}
