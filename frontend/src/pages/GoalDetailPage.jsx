import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { goalsApi, reflectionsApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'
import { growthStage } from '../lib/growthStage'

const BASELINE = {
  above_usual: { key: 'goals.aboveUsual', trend: 'up' },
  below_usual: { key: 'goals.belowUsual', trend: 'down' },
  as_usual: { key: 'goals.asUsual', trend: 'flat' },
}

export default function GoalDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [reflections, setReflections] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    goalsApi.overview(id).then(setData).catch(setError)
    // Общий список (API отдаёт последние 50), фильтруем на клиенте по
    // goal_id -- отдельного query-параметра "рефлексии этой цели" на
    // бэкенде нет, тот же подход, что уже в SeasonDetailPage. Раньше
    // рефлексии на карточке цели не показывались ВООБЩЕ -- реальная
    // обратная связь: заполнил форму "About this goal", а результат
    // никуда не попадал на глаза.
    reflectionsApi.list().then((all) => setReflections(all.filter((r) => r.goal_id === id))).catch(() => {})
  }, [id])

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!data) return <CenterLoading />

  const { goal, recent_actions: recentActions, qualities } = data
  // Самая содержательная метрика продукта (§4.2): проявляет ли эта цель
  // в тебе лучшее или худшее. Один явный вывод сверху, а не строка в
  // таблице -- above_usual важнее для человека, чем below_usual/as_usual,
  // поэтому если оно есть хотя бы у одного качества, оно и выводится.
  const withBaseline = qualities.filter((q) => q.vs_baseline)
  const headline = withBaseline.find((q) => q.vs_baseline === 'above_usual')
    || withBaseline.find((q) => q.vs_baseline === 'below_usual')
    || withBaseline[0]

  return (
    <div className="screen">
      <Link to="/goals" style={{ fontSize: '0.85rem' }}>← {t('goals.title')}</Link>
      <h1>{goal.name}</h1>
      {goal.description && <p>{goal.description}</p>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="pill">{goal.status_code}</span>
        <span className="pill pill--gold">{goal.priority_code}</span>
        {goal.progress_pct != null && <span className="pill">{goal.progress_pct}%</span>}
      </div>

      {headline && (
        <Link
          to={`/qualities/${headline.quality_id}`}
          className="card card--tappable"
          style={{
            display: 'block', textDecoration: 'none', color: 'inherit',
            borderLeft: `3px solid var(--${BASELINE[headline.vs_baseline].trend === 'up' ? 'growth' : BASELINE[headline.vs_baseline].trend === 'down' ? 'brick' : 'line'})`,
          }}
        >
          <div className="eyebrow">{headline.name.en}</div>
          <div style={{ fontSize: '1.05rem', marginTop: 2 }}>
            <span className={`trend-${BASELINE[headline.vs_baseline].trend}`} style={{ marginRight: 6 }}>
              {BASELINE[headline.vs_baseline].trend === 'up' ? '↗' : BASELINE[headline.vs_baseline].trend === 'down' ? '↘' : '→'}
            </span>
            {t(BASELINE[headline.vs_baseline].key)}
          </div>
        </Link>
      )}

      <h3>{t('goals.recentActions')}</h3>
      {recentActions.length === 0 && <p className="empty-state">{t('home.noActions')}</p>}
      {recentActions.map((a) => (
        <Link key={a.id} to={`/actions/${a.id}`} className="card card--tappable" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div>{a.name}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>{a.occurred_at}</div>
        </Link>
      ))}

      {qualities.filter((q) => q.quality_id !== headline?.quality_id).length > 0 && (
        <>
          <h3>{t('goals.qualitiesHere')}</h3>
          {qualities.filter((q) => q.quality_id !== headline?.quality_id).map((q) => (
            <Link key={q.quality_id} to={`/qualities/${q.quality_id}`} className="card card--tappable" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div className="stat-row-name">{q.name.en}</div>
              <div className="stat-row-details">
                {/* Стадия -- по ОБЩЕЙ статистике качества (avg_score_all_time),
                    не по узкому срезу внутри этой цели (avg_in_goal). Раньше
                    было наоборот: у качества с богатой историей в других
                    целях/действиях здесь всегда писалось "not enough data
                    yet", если внутри ИМЕННО ЭТОЙ цели было < 3 проявлений --
                    даже когда общих данных давно достаточно. Теперь это два
                    разных, оба осмысленных числа: устойчивая стадия качества
                    в целом, и отдельно -- как оно ведёт себя именно здесь. */}
                <span>{t(`stats.stage.${growthStage(q) ?? 'none'}`)}</span>
                <span className="eyebrow">{t('goals.inThisGoal', { avg: Number(q.avg_in_goal).toFixed(1) })}</span>
                {q.vs_baseline && (
                  <span className={`pill${q.vs_baseline === 'below_usual' ? ' pill--brick' : q.vs_baseline === 'above_usual' ? ' pill--gold' : ''}`}>
                    {t(BASELINE[q.vs_baseline].key)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </>
      )}

      {/* §4 обратной связи: "статистика в цели может включать в себя
          объединённую статистику всех подцелей вместе... а также разбивку
          статистик подцелей отдельно". Только когда у цели ЕСТЬ подцели --
          бэкенд возвращает subtree=null для листовых целей (обычный,
          самый частый случай), иначе это была бы точная копия уже
          показанных выше чисел. */}
      {data.subtree && (
        <>
          <h3>{t('goals.combinedWithSubgoals', { count: data.subtree.descendant_goal_count })}</h3>
          {data.subtree.qualities.map((q) => (
            <Link key={q.quality_id} to={`/qualities/${q.quality_id}`} className="card card--tappable" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div className="stat-row-name">{q.name.en}</div>
              <div className="stat-row-details">
                <span>{t(`stats.stage.${growthStage(q) ?? 'none'}`)}</span>
                <span className="eyebrow">{t('goals.inThisGoal', { avg: Number(q.avg_in_goal).toFixed(1) })}</span>
                {q.vs_baseline && (
                  <span className={`pill${q.vs_baseline === 'below_usual' ? ' pill--brick' : q.vs_baseline === 'above_usual' ? ' pill--gold' : ''}`}>
                    {t(BASELINE[q.vs_baseline].key)}
                  </span>
                )}
              </div>
            </Link>
          ))}

          <h3>{t('goals.subgoals')}</h3>
          {data.children.map((c) => (
            <Link key={c.id} to={`/goals/${c.id}`} className="card card--tappable" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div className="stat-row-name">{c.name}</div>
              <div className="stat-row-details">
                <span className="pill">{c.status_code}</span>
                <span className="eyebrow">{t('goals.ownActions', { count: c.action_count })}</span>
                {/* Собственные подцели этой подцели -- дальше вглубь дерева
                    не разворачиваем здесь: у своей карточки эта подцель
                    получит точно такую же секцию, если сама имеет детей.
                    Не дублируем содержимое чужой карточки заранее. */}
                {c.child_goal_count > 0 && <span className="eyebrow">+{c.child_goal_count}</span>}
              </div>
            </Link>
          ))}
        </>
      )}

      {reflections.length > 0 && (
        <>
          <h3>{t('reflections.title')}</h3>
          {reflections.map((r) => (
            <Link key={r.id} to={`/reflections/${r.id}`} className="card card--tappable" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div className="eyebrow">{r.occurred_at}</div>
              {r.insight && <div style={{ marginTop: 4 }}>{r.insight}</div>}
            </Link>
          ))}
        </>
      )}
      <Link to={`/reflections/new?goal_id=${goal.id}`} className="btn btn-secondary" style={{ display: 'block', textAlign: 'center', marginTop: 16 }}>
        {t('reflections.aboutGoal')}
      </Link>
    </div>
  )
}
