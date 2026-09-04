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
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // :id может быть ЛИБО id принятого качества (uq.id), ЛИБО
  // catalog_quality_id -- для человека это одна и та же «карточка этого
  // качества», и оба варианта должны открываться. Сперва пробуем как
  // принятое (быстрый путь для всех существующих ссылок в приложении),
  // при QUALITY_NOT_FOUND -- ищем в каталоге.
  function load() {
    setError(null)
    return qualitiesApi.overview(id)
      .then(setData)
      .catch((e) => {
        if (e.code !== 'QUALITY_NOT_FOUND') { setError(e); return }
        return catalogApi.qualities().then((catalog) => {
          const c = catalog.find((x) => x.id === id)
          if (!c) { setError(e); return }
          // Приводим к той же форме, что и overview: одна вёрстка ниже
          // не должна знать, «принято» качество или нет -- статистики
          // просто ещё нет, и это честный ноль, а не другой экран.
          setData({
            quality: { ...c, catalog_quality_id: c.id, focus_code: 'not_in_focus', expression_count: 0 },
            recent_expressions: [],
            by_context: [],
          })
        }).catch(() => setError(e))
      })
  }

  useEffect(() => { setData(null); load() }, [id])

  const inFocus = data?.quality?.focus_code === 'current_focus'

  async function toggleFocus() {
    setBusy(true)
    setError(null)
    try {
      const q = data.quality
      if (inFocus) {
        // Убрать из фокуса, а не «удалить качество»: сам каталог у всех
        // общий, удалять из него нечего.
        await qualitiesApi.update(q.id, { focus_code: 'not_in_focus' })
        await load()
      } else if (q.id === q.catalog_quality_id) {
        // Строки user_qualities ещё нет -- создаём молча. Для человека
        // это просто «добавил в фокус», никакого «принятия» он не видит.
        const uq = await qualitiesApi.adopt({ catalog_quality_id: q.catalog_quality_id, focus_code: 'current_focus' })
        navigate(`/qualities/${uq.id}`, { replace: true })
      } else {
        await qualitiesApi.update(q.id, { focus_code: 'current_focus' })
        await load()
      }
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>

  if (!data) return <CenterLoading />

  const { quality: q, recent_expressions: recent, by_context: byContext } = data
  // recent приходит новое->старое (для списка); спарклайну нужен обратный
  // порядок, чтобы линия читалась слева направо как течение времени.
  const sparkPoints = [...recent].reverse().map((e) => ({ score: e.score }))
  const trendArrow = q.trend ? TREND_ARROW[q.trend] : null
  // Есть ли вообще на чём строить статистику: хоть одно проявление
  // (ступень роста или обратное). Ноль -- показывать нечего.
  const hasStats = (q.expression_count ?? 0) > 0 || (q.inversion_count ?? 0) > 0
  const maxContext = byContext.length ? Math.max(...byContext.map((c) => c.count)) : 0

  return (
    <div className="screen">
      <Link to="/qualities" style={{ fontSize: '0.85rem' }}>← {t('qualities.title')}</Link>
      <h1>{q.name.en}</h1>
      {q.definition?.en && <p>{q.definition.en}</p>}
      {/* Переключатель фокуса вместо прежней кнопки «Select this quality».
          «Принять качество» было лишней сущностью: каталог у всех один и
          тот же, личное здесь ровно одно -- в фокусе оно или нет. Раньше
          у непринятого качества была СВОЯ, другая вёрстка (название +
          определение + кнопка), из-за чего одна и та же карточка
          выглядела как «неизвестно откуда взявшаяся страница». */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className={inFocus ? 'btn btn-secondary' : 'btn btn-primary'}
                style={{ width: 'auto' }} disabled={busy} onClick={toggleFocus}>
          {busy ? t('common.loading') : inFocus ? t('qualities.removeFromFocus') : t('qualities.addToFocus')}
        </button>
      </div>

      {/* Блок статистики -- только когда есть на чём её строить. У
          качества без единого проявления он раньше показывал
          «Not yet sparked» крупно, под ним «Not enough data yet», а
          рядом «AVERAGE ACROSS 0 GROWTH ENTRIES» -- три способа сказать
          «данных нет» и ни одного полезного. Теперь пусто значит пусто:
          ниже просто «Nothing logged yet». */}
      {hasStats && (
        <>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
              <div>
                <div className="eyebrow">{t('qualities.average')}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', lineHeight: 1.1 }}>
                  {t(`stats.stage.${growthStage(q) ?? 'none'}`)}
                  {trendArrow && (
                    <span className={TREND_CLASS[q.trend] || 'trend-flat'}
                          style={{ fontSize: '1.1rem', marginLeft: 6 }}
                          aria-label={t(`stats.trend.${q.trend}`)}>
                      {trendArrow}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                  {q.avg_score_all_time != null && `${Number(q.avg_score_all_time).toFixed(1)}`}
                  {q.trend && ` · ${t(`stats.trend.${q.trend}`)}`}
                </div>
              </div>
              {sparkPoints.length >= 2 && <Sparkline points={sparkPoints} width={140} height={40} />}
            </div>
          </div>

          <div className="eyebrow" style={{ marginTop: 8, marginBottom: 16 }}>
            {/* При малых данных честно говорим об объёме выборки, при
                достаточных -- показываем устойчивость: насколько ровно
                качество проявляется, а не только каким в среднем. Это
                разные вопросы, и второй виден только когда есть на чём
                его считать. */}
            {q.confidence === 'no_data' || q.confidence === 'very_limited'
              ? t('stats.growth_basis', { count: q.expression_count })
              : `${t(`stats.stability.${q.stability}`)} · ${t('stats.growth_basis', { count: q.expression_count })}`}
            {q.inversion_count > 0 && (
              <>
                {' · '}
                {t(q.inversion_count === 1 ? 'stats.inversions_count_one' : 'stats.inversions_count_other',
                   { count: q.inversion_count })}
              </>
            )}
          </div>
        </>
      )}

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
                <span>{c.context_label?.en || '—'}</span>
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
