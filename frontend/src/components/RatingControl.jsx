import { useTranslation } from 'react-i18next'

/**
 * Оценка проявления качества в конкретном действии.
 *
 * Шкала именованная, не числовая: 1..4 -- ступени РОСТА (Spark, Kindling,
 * Flame, Gem), 0 -- обратное проявление ВНЕ этой шкалы. Метафора из Агни
 * Йоги: огонь как сила развития кристаллизуется в твёрдую черту характера,
 * поэтому нижние ступени горят, а верхняя -- камень.
 *
 * Почему названия, а не цифры: полностью подписанные шкалы дают лучшее
 * качество данных, чем числовые -- подпись снимает вопрос "а что тут
 * значит 2?". Для ежедневного повторяющегося ввода это важнее, чем
 * компактность.
 *
 * Почему 0 нарисован отдельно и с отступом: это не низшая ступень, а
 * запись другого рода. Он не участвует в средних (см. quality_stats,
 * миграция 10) и не должен читаться как "минус первый уровень".
 * Пользователь делает два простых выбора -- "вперёд или иначе", и только
 * если вперёд, то из четырёх подписанных ступеней -- вместо одного
 * выбора из пяти. Это когнитивно легче.
 *
 * value может быть null (ничего не выбрано) -- единственно корректное
 * "ещё не оценено". Предзаполненного значения нет намеренно: в исходном
 * концепте слайдеры стояли на нуле, и в базу писались ложные срывы для
 * качеств, которые пользователь вообще не имел в виду.
 */
export default function RatingControl({ value, onChange }) {
  const { t } = useTranslation()

  return (
    <div className="rating-row" role="radiogroup" aria-label={t('rating.groupLabel')}>
      <button
        type="button"
        className={`rating-zero${value === 0 ? ' selected' : ''}`}
        role="radio"
        aria-checked={value === 0}
        aria-label={`${t('rating.inverted.name')} — ${t('rating.inverted.hint')}`}
        title={t('rating.inverted.hint')}
        onClick={() => onChange(0)}
      >
        {t('rating.inverted.short')}
      </button>
      {[
        { level: 1, key: 'spark' },
        { level: 2, key: 'kindling' },
        { level: 3, key: 'flame' },
        { level: 4, key: 'gem' },
      ].map(({ level, key }) => (
        <button
          key={key}
          type="button"
          data-level={level}
          className={`rating-dot${value === level ? ' selected' : ''}`}
          role="radio"
          aria-checked={value === level}
          aria-label={`${t(`rating.${key}.name`)} — ${t(`rating.${key}.hint`)}`}
          title={t(`rating.${key}.hint`)}
          onClick={() => onChange(level)}
        >
          {t(`rating.${key}.name`)}
        </button>
      ))}
    </div>
  )
}
