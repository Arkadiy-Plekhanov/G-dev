import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { cyclesApi, goalsApi, qualitiesApi, catalogApi } from '../api/resources'
import { get } from '../api/client'
import { CenterLoading, ErrorBanner } from '../components/Feedback'
import SeasonMemberPicker from '../components/SeasonMemberPicker'
import QualityPicker from '../components/QualityPicker'

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
  const [catalog, setCatalog] = useState([])
  const [picking, setPicking] = useState(false)
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
      // Весь каталог, а не только принятые: поиск в сезоне должен доставать
      // любое из 169 качеств. Ограничение принятыми было тем же
      // искусственным сужением, что мы убрали на странице качеств --
      // сезон длинный, и брать в него качество, которого сейчас нет ни в
      // фокусе, ни в списке принятых, совершенно нормально.
      catalogApi.qualities(),
    ]
    Promise.all(isEdit ? [...base, cyclesApi.get(id)] : base)
      .then(([statuses, g, q, catalog, existing]) => {
        setStatusOptions(statuses)
        setGoals(g)
        setMyQualities(q)
        setCatalog(catalog)
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

  // По умолчанию видны только качества в фокусе -- тот же принцип, что
  // на экране логирования действия: то, чем человек занят прямо сейчас,
  // должно быть под рукой без поиска. Раньше здесь сразу показывались ВСЕ
  // качества (со своей статистикой у принятых, с определением у остальных)
  // -- то есть страница на 169 карточек до всякого поиска, ровно то, от
  // чего мы уходили на странице Qualities.
  //
  // Уже выбранное для сезона качество, которого нет в фокусе, тоже
  // остаётся видимым -- иначе при редактировании существующего сезона
  // выбор молча пропадал бы из виду (хотя оставался бы в самих данных).
  const visibleQualities = myQualities.filter(
    (q) => q.focus_code === 'current_focus' || qualityIds.has(q.id),
  )
  const pickerExcludeIds = new Set(myQualities.map((q) => q.id))

  function toggleQuality(userQualityId) {
    toggle(qualityIds, setQualityIds, userQualityId)
  }

  function onQualityPicked(mq) {
    setMyQualities((prev) => (prev.some((q) => q.id === mq.id) ? prev : [...prev, mq]))
    setQualityIds((prev) => new Set(prev).add(mq.id))
    setPicking(false)
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
          <Link to="/cycles" className="btn btn-secondary" style={{ display: 'block', marginTop: 8, textAlign: 'center' }}>
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
            {statusOptions.map((o) => <option key={o.code} value={o.code}>{o.label.en}</option>)}
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
          <SeasonMemberPicker
            items={goals.map((g) => ({ id: g.id, label: g.name, sub: g.status_code }))}
            selectedIds={goalIds}
            onToggle={(id) => toggle(goalIds, setGoalIds, id)}
            searchPlaceholder={t('seasons.searchGoals')}
            emptyText={t('seasons.noGoalsYet')}
          />
        </div>

        <div className="field">
          <label>{t('seasons.qualities')}</label>
          {/* По умолчанию видны только качества в фокусе -- тот же паттерн,
              что уже проверен на экране логирования действия («Much like
              in Action Log»): то, чем человек занят сейчас, доступно сразу
              одним тапом, без похода в поиск. Полный каталог из 169 --
              через явный поиск ниже, а не вываливается на страницу заранее. */}
          {visibleQualities.length === 0 && (
            <p className="eyebrow" style={{ marginBottom: 8 }}>{t('qualities.noFocus')}</p>
          )}
          {visibleQualities.map((q) => {
            const picked = qualityIds.has(q.id)
            return (
              <div key={q.id} className="card stat-row stat-row--action">
                <div className="stat-row-name">
                  <div>{q.name.en}</div>
                  {q.focus_code === 'current_focus' && <span className="eyebrow">{t('qualities.inFocus')}</span>}
                </div>
                <button
                  type="button"
                  className={picked ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ width: 'auto', flexShrink: 0 }}
                  onClick={() => toggleQuality(q.id)}
                  aria-label={picked ? t('seasons.removeFromSeason') : t('seasons.addToSeason')}
                >
                  {picked ? '✓' : '+'}
                </button>
              </div>
            )
          })}
          {picking ? (
            <QualityPicker myQualities={myQualities} excludeIds={pickerExcludeIds} onPick={onQualityPicked}
                           onAdopted={(q) => setMyQualities((prev) => [...prev, q])} />
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setPicking(true)}>
              {t('action.searchAllQualities')}
            </button>
          )}
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()} style={{ width: '100%' }}>
          {saving ? t('common.loading') : (isEdit ? t('seasons.save') : t('seasons.create'))}
        </button>
      </form>
    </div>
  )
}
