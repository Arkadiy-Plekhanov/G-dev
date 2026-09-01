import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { goalsApi } from '../api/resources'
import { get } from '../api/client'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

export default function GoalsListPage() {
  const { t } = useTranslation()
  const [goals, setGoals] = useState(null)
  const [statuses, setStatuses] = useState([])
  const [priorities, setPriorities] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [statusCode, setStatusCode] = useState('active')
  const [priorityCode, setPriorityCode] = useState('p3_normal')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function load() {
    goalsApi.list().then(setGoals).catch(setError)
  }

  useEffect(() => {
    load()
    get('/reference/options/goal_status').then(setStatuses).catch(() => {})
    get('/reference/options/priority').then(setPriorities).catch(() => {})
  }, [])

  async function createGoal(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await goalsApi.create({ name: name.trim(), parent_id: parentId || null, status_code: statusCode, priority_code: priorityCode })
      setName(''); setParentId(''); setShowForm(false)
      load()
    } catch (e2) {
      setError(e2)
    } finally {
      setSaving(false)
    }
  }

  if (!goals) return <CenterLoading />

  return (
    <div className="screen">
      <h1>{t('goals.title')}</h1>
      <ErrorBanner error={error} />

      {goals.length === 0 && !showForm && <p className="empty-state">{t('goals.empty')}</p>}

      {goals.map((g) => (
        <Link key={g.id} to={`/goals/${g.id}`} className="card card--tappable card-link"
              style={{ marginLeft: `${(g.level - 1) * 14}px` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{g.name}</strong>
            <span className="pill">{g.status_code}</span>
          </div>
          {g.action_count > 0 && <span className="eyebrow">{g.action_count} actions</span>}
        </Link>
      ))}

      {showForm ? (
        <form className="card" onSubmit={createGoal}>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('goals.namePlaceholder')} required />
          </div>
          <div className="field">
            <label>{t('goals.parent')}</label>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">—</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.path || g.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t('goals.status')}</label>
            <select value={statusCode} onChange={(e) => setStatusCode(e.target.value)}>
              {statuses.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t('goals.priority')}</label>
            <select value={priorityCode} onChange={(e) => setPriorityCode(e.target.value)}>
              {priorities.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" disabled={saving}>{saving ? t('common.loading') : t('common.save')}</button>
        </form>
      ) : (
        <button className="btn btn-secondary" onClick={() => setShowForm(true)}>{t('goals.new')}</button>
      )}
    </div>
  )
}
