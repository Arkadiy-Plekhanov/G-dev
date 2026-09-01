import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { growthStage } from '../lib/growthStage'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { qualitiesApi, catalogApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'
import Sparkline from '../components/Sparkline'
import { SCORE_KEY, TREND_ARROW, TREND_CLASS } from '../lib/displayMaps'


/** Единая карточка качества -- ЛИБО своя (с полной статистикой), ЛИБО ещё
 * не принятая (только определение + кнопка добавить). Раньше это были
 * ДВЕ отдельные страницы (QualityDetailPage и CatalogQualityPage) --
 * реальная обратная связь: "какая-то новая, неизвестно откуда взятая
 * страница... а мог быть переход на карту качества сразу (зачем плодить
 * сущности?)". :id принимает id ЛИБО принятого качества (uq.id), ЛИБО
 * catalog_quality_id ещё не принятого -- это разные id-пространства, но
 * маршрут для человека один и тот же: "карточка этого качества".
 *
 * Механизм: сперва пробуем как принятое (быстрый путь, как раньше, без
 * лишнего запроса для всех уже существующих ссылок в приложении). Если
 * бэкенд честно отвечает QUALITY_NOT_FOUND -- это может значить не
 * "качества не существует", а "принятого качества с таким id нет", и
 * тогда пробуем найти id в каталоге как ещё не принятое. */
export default function QualityDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [notOwned, setNotOwned] = useState(null)
  const [error, setError] = useState(null)
  const [adopting, setAdopting] = useState(false)

  useEffect(() => {
    setData(null)
    setNotOwned(null)
    setError(null)
    qualitiesApi.overview(id).then(setData).catch((e) => {
      if (e.code !== 'QUALITY_NOT_FOUND') { setError(e); return }
      catalogApi.qualities()
        .then((catalog) => {
          const found = catalog.find((c) => c.id === id)
          found ? setNotOwned(found) : setError(e)
        })
        .catch(() => setError(e))
    })
  }, [id])

  async function adopt() {
    setAdopting(true)
    setError(null)
    try {
      const uq = await qualitiesApi.adopt({ catalog_quality_id: id, focus_code: 'current_focus' })
      navigate(`/qualities/${uq.id}`, { replace: true })
    } catch (e) {
      setError(e)
      setAdopting(false)
    }
  }

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>

  if (notOwned) {
    return (
      <div className="screen">
        <Link to="/qualities" style={{ fontSize: '0.85rem' }}>← {t('qualities.title')}</Link>
        <h1>{notOwned.name.en}</h1>
        <p>{notOwned.definition.en}</p>
        <button className="btn btn-primary" onClick={adopt} disabled={adopting} style={{ width: '100%' }}>
          {adopting ? t('common.loading') : t('onboarding.selectThis')}
        </button>
      </div>
    )
  }

  if (!data) return <CenterLoading />

  const { quality: q, recent_expressions: recent, by_context: byContext } = data
  // recent приходит новое->старое (для списка); спарклайну нужен обратный
  // порядок, чтобы линия читалась слева направо как течение времени.
  const sparkPoints = [...recent].reverse().map((e) => ({ score: e.score }))
  const trendArrow = q.trend ? TREND_ARROW[q.trend] : null
  const maxContext = byContext.length ? Math.max(...byContext.map((c) => c.count)) : 0

  return (
    <div className="screen">
      <Link to="/qualities" style={{ fontSize: '0.85rem' }}>← {t('qualities.title')}</Link>
      <h1>{q.name.en}</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="pill">{t(`stats.stage.${growthStage(q) ?? 'none'}`)}</span>
        {q.focus_code === 'current_focus' && <span className="pill pill--gold">{t('qualities.focus')}</span>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div>
            <div className="eyebrow">{t('qualities.average')}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', lineHeight: 1.1 }}>
              {t(`stats.stage.${growthStage(q) ?? 'none'}`)}
              {trendArrow && (
                <span
                  className={TREND_CLASS[q.trend] || 'trend-flat'}
                  style={{ fontSize: '1.1rem', marginLeft: 6 }}
                  aria-label={t(`stats.trend.${q.trend}`)}
                >
                  {trendArrow}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
              {q.avg_score_all_time != null && `${Number(q.avg_score_all_time).toFixed(1)} · `}
              {q.trend ? t(`stats.trend.${q.trend}`) : '—'}
            </div>
          </div>
          {/* Спарклайну нужно минимум 2 точки -- компонент сам возвращает
              null на меньшем, так что условие здесь только ради того, чтобы
              не резервировать пустое место в раскладке зря. */}
          {sparkPoints.length >= 2 && <Sparkline points={sparkPoints} width={140} height={40} />}
        </div>
      </div>

      {/* Честность про уверенность (§4.1): при малых данных прямо говорим
          об этом, а не подставляем среднее по двум точкам как факт. */}
      <div className="eyebrow" style={{ marginTop: 8, marginBottom: 16 }}>
        {q.confidence === 'no_data' || q.confidence === 'very_limited'
          ? t('stats.growth_basis', { count: q.expression_count })
          : `${t(`stats.stability.${q.stability}`)} · ${t(`stats.confidence.${q.confidence}`)}`}
        {q.inversion_count > 0 && (
          <>
            {' · '}
            {t(q.inversion_count === 1 ? 'stats.inversions_count_one' : 'stats.inversions_count_other',
               { count: q.inversion_count })}
          </>
        )}
      </div>

      <h3>{t('qualities.recentExpressions')}</h3>
      {recent.length === 0 && <p className="empty-state">{t('home.noActions')}</p>}
      {recent.map((e) => (
        <Link key={e.action_id + e.occurred_at} to={`/actions/${e.action_id}`} className="card card--tappable card-link card-link--row">
          <div>
            <div>{e.action_name}</div>
            <span className="eyebrow">{e.occurred_at}</span>
            {e.comment && <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{e.comment}</div>}
          </div>
          <span className={`pill${e.score === 0 ? ' pill--brick' : ''}`}>
            {t(`rating.${SCORE_KEY[e.score]}.name`)}
          </span>
        </Link>
      ))}

      {byContext.length > 0 && (
        <>
          <h3>{t('qualities.byContext')}</h3>
          {byContext.map((c) => (
            <div key={c.context_id ?? 'none'} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>{c.context_label || '—'}</span>
                <span className="eyebrow">{c.count} · {Number(c.avg_score).toFixed(1)}</span>
              </div>
              {/* Горизонтальная полоса -- относительно самого частого
                  контекста, не абсолютная шкала: показывает "где чаще",
                  а не претендует на точную пропорцию по всем данным. */}
              <div style={{ height: 4, background: 'var(--line)', borderRadius: 2 }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: 'var(--growth)',
                  width: `${maxContext ? (c.count / maxContext) * 100 : 0}%`,
                }} />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
