import { useTranslation } from 'react-i18next'
import RatingControl from './RatingControl'
import QualityPicker from './QualityPicker'

/**
 * Список качеств с оценками -- общий для «записать действие» и «рефлексия»,
 * потому что это буквально одно и то же: «какие качества здесь проявились».
 *
 * Два изменения по реальной обратной связи, оба про трение:
 *
 * 1. Качества в фокусе показываются СРАЗУ строками с оценкой, а не
 *    «облаком тегов», которое сначала надо натыкать. Раньше на каждое
 *    качество уходило два действия (выбрать чип -> поставить оценку);
 *    теперь одно. Именно фокус-качества человек отмечает чаще всего --
 *    ради них не должно быть лишнего шага.
 *
 * 2. Оценка НЕОБЯЗАТЕЛЬНА. Раньше форму нельзя было сохранить, пока не
 *    оценено каждое показанное качество -- а показаны теперь все
 *    фокусные, то есть человек был обязан оценить всё подряд, даже то,
 *    что в этом поступке не проявлялось. Неоценённое качество просто
 *    не учитывается (не отправляется на бэкенд) -- это не «забыл
 *    заполнить», а нормальный, самый частый случай.
 *
 * rows: [{userQualityId, name, score: null|0-4, comment, pinned}]
 *   pinned -- качество из фокуса, показано всегда; такое не убирается
 *   крестиком (убрать его из фокуса можно на странице качеств), в
 *   отличие от добавленного вручную через поиск.
 */
export default function QualityRatingList({
  rows, onSetScore, onRemove, myQualities, onPick, onAdopted, picking, onOpenPicker,
}) {
  const { t } = useTranslation()
  const excludeIds = new Set(rows.map((r) => r.userQualityId))

  return (
    <>
      {rows.length === 0 && (
        <p className="empty-state" style={{ padding: 'var(--space-4)' }}>{t('action.noneSelectedYet')}</p>
      )}

      {rows.map((r) => (
        <div key={r.userQualityId} className="card">
          <div className="stat-row" style={{ marginBottom: 8 }}>
            <strong className="stat-row-name">{r.name}</strong>
            {!r.pinned && (
              <button type="button" className="btn btn-secondary" style={{ width: 'auto', flexShrink: 0, padding: '2px 10px' }}
                      onClick={() => onRemove(r.userQualityId)} aria-label={t('common.remove')}>✕</button>
            )}
          </div>
          <RatingControl value={r.score} onChange={(score) => onSetScore(r.userQualityId, score)} />
        </div>
      ))}

      {picking ? (
        <QualityPicker myQualities={myQualities} excludeIds={excludeIds} onPick={onPick} onAdopted={onAdopted} />
      ) : (
        <button type="button" className="btn btn-secondary" onClick={onOpenPicker}>
          {t('action.searchAllQualities')}
        </button>
      )}
    </>
  )
}
