import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { cyclesApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

/** §1.1: активный сезон -- первым и визуально выделен; завершённые -- ниже.
 * Бэкенд уже отдаёт start_date DESC NULLS LAST, что для одного активного
 * сезона (гарантия БД: one_active_cycle_per_user) само по себе почти всегда
 * кладёт его сверху -- но "почти всегда" не то же самое, что "всегда"
 * (сезон без даты начала, более новый planned-сезон), поэтому статус
 * проверяется явно, а не полагается на порядок сортировки бэкенда.
 *
 * Ровно один сезон (типичный случай сразу после первого создания) --
 * список из одной карточки не несёт ценности сам по себе, только лишний
 * клик до содержимого. Редирект прямо на карточку, а не дублирование её
 * разметки здесь превью-версией: как только появится второй сезон,
 * список снова осмыслен и появляется сам собой. */
export default function SeasonsListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    cyclesApi.list().then(setSeasons).catch(setError)
  }, [])

  useEffect(() => {
    if (seasons?.length === 1) navigate(`/cycles/${seasons[0].id}`, { replace: true })
  }, [seasons, navigate])

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!seasons || seasons.length === 1) return <CenterLoading />

  const active = seasons.find((s) => s.status_code === 'active')
  const rest = seasons.filter((s) => s.status_code !== 'active')

  return (
    <div className="screen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{t('seasons.title')}</h1>
        {/* Кнопка в шапке -- только когда список НЕ пуст. При пустом
            списке ниже и так стоит призыв «Start a season», и две кнопки,
            ведущие в одно и то же место, просто спорили друг с другом
            (плюс верхняя наезжала на заголовок -- см. скриншот). */}
        {!active && seasons.length > 0 && (
          <Link to="/cycles/new" className="btn btn-primary" style={{ padding: '8px 14px' }}>
            {t('seasons.new')}
          </Link>
        )}
      </div>

      {seasons.length === 0 && (
        <div className="empty-state">
          <p>{t('seasons.empty')}</p>
          <p style={{ fontSize: '0.85rem', marginBottom: 16 }}>{t('seasons.emptyHint')}</p>
          <Link to="/cycles/new" className="btn btn-primary" style={{ display: 'inline-block' }}>
            {t('seasons.startSeason')}
          </Link>
        </div>
      )}

      {active && (
        <Link to={`/cycles/${active.id}`} className="card card--tappable card-link" style={{ borderLeft: '3px solid var(--growth)' }}>
          <span className="pill pill--gold" style={{ marginBottom: 6, display: 'inline-block' }}>{t('seasons.active')}</span>
          <div style={{ fontSize: '1.1rem' }}>{active.name}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>{active.start_date} → {active.end_date || '…'}</div>
        </Link>
      )}

      {rest.map((s) => (
        <Link key={s.id} to={`/cycles/${s.id}`} className="card card--tappable card-link">
          <div>{s.name}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>
            {s.start_date || '…'} → {s.end_date || '…'} · {s.status_code}
          </div>
        </Link>
      ))}
    </div>
  )
}
