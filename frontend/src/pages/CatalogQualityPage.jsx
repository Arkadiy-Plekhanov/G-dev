import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { catalogApi, qualitiesApi } from '../api/resources'
import { CenterLoading, ErrorBanner } from '../components/Feedback'

/** Карточка качества ИЗ КАТАЛОГА -- для просмотра ДО того, как оно принято
 * пользователем ("understand deeply... before choosing", реальная обратная
 * связь с онбординга). Это НЕ QualityDetailPage: там показывается личная
 * статистика (среднее, тренд, история) уже ПРИНЯТОГО качества (id из
 * user_qualities); здесь качества может ещё не быть у пользователя вообще
 * -- значит никакой личной статистики физически не существует, и нужен
 * отдельный, более простой экран поверх catalog_quality_id.
 *
 * Отдельного бэкенд-эндпоинта под одно каталожное качество нет, и заводить
 * его не нужно: весь каталог (169 записей, короткие строки) и так одним
 * вызовом уже приходит в нескольких местах приложения -- здесь фильтруется
 * на клиенте.
 *
 * Если качество уже принято -- вместо кнопки "выбрать" ссылка на его
 * настоящую карточку (QualityDetailPage) с личной статистикой. */
export default function CatalogQualityPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [quality, setQuality] = useState(null)
  const [mine, setMine] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([catalogApi.qualities(), qualitiesApi.list()])
      .then(([catalog, myQualities]) => {
        setQuality(catalog.find((c) => c.id === id) || null)
        setMine(myQualities.find((q) => q.catalog_quality_id === id) || null)
      })
      .catch(setError)
  }, [id])

  async function adopt() {
    setBusy(true)
    setError(null)
    try {
      const uq = await qualitiesApi.adopt({ catalog_quality_id: id, focus_code: 'current_focus' })
      navigate(`/qualities/${uq.id}`)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  if (error) return <div className="screen"><ErrorBanner error={error} /></div>
  if (!quality) return <CenterLoading />

  return (
    <div className="screen">
      <button className="btn btn-secondary" style={{ width: 'auto', marginBottom: 16 }} onClick={() => navigate(-1)}>
        ← {t('common.back')}
      </button>
      <h1>{quality.name.en}</h1>
      <p>{quality.definition.en}</p>

      {mine ? (
        <Link to={`/qualities/${mine.id}`} className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
          {t('qualities.viewMyProgress')}
        </Link>
      ) : (
        <button className="btn btn-primary" onClick={adopt} disabled={busy} style={{ width: '100%' }}>
          {busy ? t('common.loading') : t('onboarding.selectThis')}
        </button>
      )}
    </div>
  )
}
