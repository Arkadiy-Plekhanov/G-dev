import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { goalsApi, reflectionsApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'
import { BASELINE } from '../lib/displayMaps'
import Sparkline from '../components/Sparkline'
import { sparklinePoints } from '../lib/sparkline'


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

  const { goal, recent_actions: recentActions, qualities: rawQualities } = data
  // Самая содержательная метрика продукта (§4.2): проявляет ли эта цель
  // в тебе лучшее или худшее. Один явный вывод сверху, а не строка в
  // таблице -- above_usual важнее для человека, чем below_usual/as_usual,
  // поэтому если оно есть хотя бы у одного качества, оно и выводится.
  // Порядок: заметно выше обычного -> заметно ниже -> как обычно/без
  // сравнения. Раньше самое примечательное выносилось отдельным блоком
  // над списком, но показывало те же данные -- читалось как дубль.
  const RANK = { above_usual: 0, below_usual: 1, as_usual: 2 }
  const qualities = [...rawQualities].sort(
    (a, b) => (RANK[a.vs_baseline] ?? 3) - (RANK[b.vs_baseline] ?? 3))

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

      <h3>{t('goals.recentActions')}</h3>
      {recentActions.length === 0 && <p className="empty-state">{t('home.noActions')}</p>}
      {recentActions.map((a) => (
        <Link key={a.id} to={`/actions/${a.id}`} className="card card--tappable card-link">
          <div>{a.name}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>{a.occurred_at}</div>
        </Link>
      ))}

      {qualities.length > 0 && (
        <>
          {/* Охват назван в ЗАГОЛОВКЕ секции, а не повторён в каждой строке:
              для всех строк он одинаков, и «in this goal» на каждой съедал
              место, которого на телефоне и так мало.
              Отдельного «главного» качества сверху больше нет -- оно
              показывало ровно то же, что и строка списка, только крупнее,
              и читалось как дубль. Самое примечательное просто идёт
              первым: сначала то, что заметно выше обычного, потом заметно
              ниже, потом остальное. */}
          <h3>{t('goals.qualityExpressionHere')}</h3>
          {qualities.map((q) => (
            <Link key={q.quality_id} to={`/qualities/${q.quality_id}`} className="card card--tappable card-link stat-row">
              <div className="stat-row-name">{q.name.en}</div>
              <div className="stat-row-details">
                {/* Ряд ТЕМАТИЧЕСКИЙ -- только проявления внутри этой цели
                    (см. recent_scores в per_goal CTE). На общих экранах в
                    том же компоненте глобальный ряд: охват соответствует
                    смыслу экрана. */}
                {sparklinePoints(q.recent_scores) && (
                  <Sparkline points={sparklinePoints(q.recent_scores)} width={72} height={20} />
                )}
                <span className="eyebrow">{Number(q.avg_in_goal).toFixed(1)}</span>
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

      {data.subtree && (
        <>
          <h3>{t('goals.combinedWithSubgoals', { count: data.subtree.descendant_goal_count })}</h3>
          {data.subtree.qualities.map((q) => (
            <Link key={q.quality_id} to={`/qualities/${q.quality_id}`} className="card card--tappable card-link stat-row">
              <div className="stat-row-name">{q.name.en}</div>
              <div className="stat-row-details">
                {/* Общая стадия качества здесь НЕ показывается: она про
                    качество вообще и живёт на его собственной карточке, а
                    этот экран отвечает на другой вопрос -- как качество
                    ведёт себя ИМЕННО ЗДЕСЬ. Три величины в строке
                    (стадия + значение в цели + сравнение) были и
                    избыточны по смыслу, и физически не помещались на
                    телефоне: правая часть выдавливала название в колонку
                    шириной в букву. */}
                <span className="eyebrow">{Number(q.avg_in_goal).toFixed(1)}</span>
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
            <Link key={c.id} to={`/goals/${c.id}`} className="card card--tappable card-link stat-row">
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
            <Link key={r.id} to={`/reflections/${r.id}`} className="card card--tappable card-link">
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
