# Hard Road: Daily Virtues — карта функционала

> Составлено 28.08.2026 по 118 скриншотам всех экранов приложения (версия 1.0.2, build 456),
> снятым владельцем вручную. Это **первичный источник**: приложение не индексируется в публичном
> вебе (App Store id6757573147), автоматически собрать данные о нём невозможно — предыдущая
> попытка исследования вернула «не подтверждено». Здесь зафиксировано то, что видно на экранах.
>
> Зачем этот документ: Hard Road — ближайший по духу конкурент (ежедневная практика добродетелей
> + разбор пороков + рефлексия), при этом устроенный принципиально иначе, чем habit-трекеры.
> Разбор нужен, чтобы заимствовать проверенные паттерны осознанно, а не копировать целиком:
> у них другая аудитория (католические мужчины) и другое ядро (фиксированные привычки), чем у нас
> (произвольные действия → произвольные качества с оценкой 0–4).

## Что это за продукт

Self-description из экрана About: *«Hard Road is a daily, continuous program that harmonizes the
Roman Catholic Church's Liturgical Calendar with everyday life… Not an app that tracks your habits:
a Rule that forges a man.»*

Аудитория — узкая и явная: католические мужчины. Это одновременно их сила (глубина, язык, отсутствие
размытости) и их потолок (за пределы конфессии продукт не выходит).

**Структура ядра — «Правило» (Rule) из 9 фиксированных привычек в 3 измерениях:**

| Измерение | Привычки |
|---|---|
| Spiritual | Pray, Consume (чтение), Examen |
| Physical | Arise (подъём), Build (тренировка), Fuel/Nourish (питание) |
| Relational | Work, Love, Leisure |

Каждая привычка привязана к добродетели (Arise → Fortitude, Pray → Faith, Consume → Prudence)
с богословским обоснованием и цитатой Писания.

---

## Карта экранов

### 1. Ежедневное ядро

**Today** — сетка 3×3 из девяти привычек (переключается на список). На карточке: иконка,
название, статус («Still Open» / время «10:15 PM»), прогресс за неделю «1/7», флажок серии.
Сверху — литургический контекст: «Friday — St. Augustine of Hippo, Day 12», строка состояния
«32d left in St. Michael's Lent · 0% consistency (30d) · Apprentice 1/5», быстрый ряд:
Check-In · Love · Shield · Challenges · Progress. Внизу — «Freezes: 3/3 available».
Нижняя навигация: **Today · Pray · Build · Nourish · Brothers**.

**Long-press на карточке** → Freeze / Add Note. **Детальный экран привычки** → расписание,
последние 7 дней, Share Today's Discipline, Edit / View Full History / Delete.
Для невыполняемых сегодня: *«Not scheduled today. Off-days don't count against you or break the streak.»*

**Daily Check-In** — оценка дня по 5-балльной шкале иконками + необязательная заметка
(«How was your day?»).

### 2. Examen (вечерний разбор совести) — самое близкое к нашей модели

Ежедневный разбор по семи смертным грехам. Для каждого — **современные, конкретные проявления**,
а не абстракция:

- Pride — *«Need for recognition, refusal to ask for help, inability to accept correction, social media self-promotion»*
- Greed — *«Materialism, hoarding, financial anxiety driven by attachment to things, workaholism for money's sake»*
- Lust — *«Pornography, objectification of others, inappropriate relationships, sexual impurity»*
- Envy — *«Comparing yourself to others, social media jealousy, resentment of others' success, bitterness»*
- Gluttony — *«Overeating, screen addiction, binge-watching, excessive gaming, overconsumption of anything»*
- Wrath — *«Road rage, harsh words to family, resentment, online arguments, holding grudges»*
- Sloth — *«Laziness, avoidance of prayer, procrastination, spiritual apathy, neglecting duties»*

**Ключевая деталь: оценка не бинарная.** Помимо переключателя есть severity —
**Mild / Moderate / Severe**. Плюс необязательный Journal (до 1000 символов) и «Past Examens»
с календарём.

Из этих данных строится аналитика: **Concern Index (0.0–5.0)**, Struggle Frequency по каждому
пороку, Average Severity, и пояснение «Understanding the Data» (что такое Frequency, Severity,
Concern Index).

**Examination Guide** — два режима: игнатианский Daily Examen (Gratitude → Petition for Light →
Review of the Day → Contrition → Resolution) и разбор по семи грехам со списком конкретных
вопросов («Have I a superior attitude in thinking, speaking, or acting?», «Do I demand recognition?»).

### 3. The Toolkit — контентный слой на каждый порок

Для каждого из семи: противоположная добродетель, патрон-святой, молитва, и четыре инструмента:

- **The Moment It Rises** — интервенция «в моменте» (см. ниже)
- **The Plan** — заранее написанное решение (см. ниже)
- **How It Actually Happens** — «лестница» эскалации
- Дополнительное чтение (литании, классические тексты)

**How It Actually Happens («The Chain»)** — разбор того, как порок разворачивается по шагам.
Для гордыни: (1) мелкая обида, (2) ты прокручиваешь её, строишь дело — и дело хорошее,
(3) рассказываешь одному человеку, только для протокола, (4) теперь важнее быть правым, чем чтобы
вышло правильно, (5) перестаёшь слушать советы, (6) уже нельзя отступить, не потеряв себя.
Вопрос пользователю: **«Which one is yours?»** Идея сформулирована точно:
*«So the work is not summoning humility at step 6, in front of everyone… It is knowing your own
step 2 — and for this vice it is almost always the private replay nobody ever sees you do.»*

### 4. The Plan — реализация implementation intentions

Двухшаговый конструктор: **PICK A SITUATION** («Someone else gets the credit for something I did»,
«I'm corrected in front of other people», «I catch myself rehearsing what I'll say»…, плюс
«Write your own») → **THEN PICK WHAT YOU'LL DO** («Say "you may be right" and stop talking»,
«Ask one more question instead of making one more point», «Do one job today that nobody will see»…).

Автоматически собирается фраза:
> *«When someone else gets the credit for something I did, I will ask one more question instead of
> making one more point.»*

→ кнопка **Keep This** и ссылка «Why it's aimed early».

Инструкция пользователю: *«Decide it now, while it's quiet. Not later, when it isn't.»* и
*«Aim it early — at step 2 of your staircase, not step 6»* (связка с «лестницей» выше).

**Это учебниковая реализация implementation intentions (Gollwitzer)** — того самого приёма,
у которого в мета-анализе d = 0.65. Никакой психологической терминологии в интерфейсе нет.

### 5. The Moment It Rises — интервенция «в моменте»

Поток на 4–6 экранов, когда порок поднимается прямо сейчас:

1. **Какой именно?** — «Pride — met by Humility», «Envy — met by Charity», «Wrath — met by Meekness»,
   «Sloth — met by Diligence», «Greed — met by Generosity», «Gluttony — met by Temperance»,
   «Lust — met by Chastity». Заголовок: *«You come here instead. That already counts.»*
2. **Насколько громко?** — Quiet («A passing pull. There's room to think.») / Middling («Insistent,
   but you're still driving.») / Loud («It has the body. Move first, think after.»)
3. **Что на самом деле сейчас?** — Hungry / Angry / Lonely / Tired / Bored / Stressed (это HALT
   из терапии зависимостей)
4. **Выбери почву** — Physical / Spiritual / Relational / Reflect
5. **Конкретная практика** — например «The Long Breath, and the Name»: вдох через нос, выдох вдвое
   длиннее и вдвое медленнее, на каждом выдохе одна строка: «Jesus, meek and humble of heart».
   Десять раз.
6. **Как прошло?** — «A stand was made» / «I only felt it. Nothing happened.» / «It went the other way.»
   → и в ответ **не оценка, а нормализация**: *«Feeling anger is not sinning. Scripture takes for
   granted that you will feel it… The movement rose, and you did not consent to it.»*

**«The Moment It Settles»** — отдельный экран после срыва: *«Nothing was lost here. No streak, no
standing, nothing was taken from you. What matters now is only the next hour.»*

### 6. Deep Examen / Rule of Life — сезонная глубокая рефлексия (26 шагов)

Отдельный от ежедневного, «стратегический» разбор, который проходят раз в сезон:

- **Stillness** — вход: *«There are no scores here. We do this because you matter, not because you're failing.»*
- **The Struggle** — где ты буксуешь (подсказка из данных: *«Your daily examen suggests your hardest
  front lately is Pride. Does that ring true?»*) → назови конкретный случай → насколько важно расти
  в этой добродетели (0–10) → **«Why that number — and not a lower one?»**
- **The Vision** — «Представь год спустя, что изменилось?» → **«Name it as identity»**: «I am becoming
  a man who…» → выбор ценностей-якорей из чипов (Faith, Prayer, Humility, Courage, Discipline,
  Chastity, Diligence, Generosity, Patience, Honesty, Fatherhood, Brotherhood, Service, Temperance,
  Fortitude, Wisdom, Gratitude, Perseverance, Mercy, Reverence)
- **Rule of Life** — конкретное правило + **«When you slip»**: *«A slip is one situation you didn't
  yet — not who you are. What will you do to begin again?»*
- **Seal your Rule** — *«This becomes your living baseline. Live it for a few days before you change
  it — then each season we'll see how far you've come.»*

### 7. Progress / Performance — аналитика

- **Overall Summary**: Completed 10/18, Rate 55%, Streak, Consistency 50%; фильтры 7D/30D/90D/1Y/All
- **Daily Score Trend** — график + недельный/месячный календарь-хитмап
- **Categories** — Spiritual 66% / Physical 50% / Relational 50%
- **Habits sorted by attention needed** — сортировка по тому, что проседает
- **Детализация привычки**: кольцо серии, Period Metrics, **Weekday Distribution**, **Time of Day**,
  **Integrity Signals** (Late Entries, Frozen Days — честность данных!), Last 7 Days
- **Examen-аналитика**: Concern Index, Struggle Frequency, Average Severity по каждому пороку
- **Trends & Insights**: «11 of 54 disciplines kept this week», Show-up rate за 12 недель,
  **«Where you slip»** хитмап, **«Your front this season: Pride → Humility»**,
  **«One thing this week: Do one good thing today that no one will ever see.»**
- **Calibrating…** — *«Complete 3 more days to see personalized recommendations»* (честно про
  недостаток данных вместо выдумывания инсайтов)

### 8. Brotherhood — групповая подотчётность

*«Not a social network. A foxhole.»* Группы 3–8 человек, вступление по 6-символьному коду.

- **Group Pulse**: Avg Completion, Checked In Today, Group Streak
- **Group Challenges** из каталога: Arise & Shine, Prayer Fortress, Feed the Mind, Night Watch,
  Iron Sharpens Iron, Clean Fast Week, Full Armor, Rosary Crusade, No Excuse Week и др.
- **Accountability Anchor** — *«Choose one brother on your rotation — with their okay, they'll get
  your weekly accountability report»*
- **Анонимные агрегаты** по всему сообществу (29 активных, Avg Habits/Day, % Whole Days,
  Total Prayer Time, Total Days Fasted, Total Workouts, Total Miles Run…)
- **Men Seeking Brotherhood** — матчинг: *«These men asked to be found. If your Brotherhood has a
  seat, hand one of them the code.»*
- Мост наружу: Create WhatsApp Group / Invite via Message
- Приватность: *«No personal data is shared — only aggregate numbers»*, отдельный тумблер
  Contribute to Brotherhood

### 9. Защита серий (важно!)

- **Freezes: 3/3 available** — заморозки
- **Pause Mode** — *«Pause when traveling, sick, or on retreat. Streaks pause — but neither grow nor
  break while paused.»*
- **The Sharpening** — отложить одну дисциплину на сезон (травма, поездка): *«nothing counts against
  you while it rests»*
- Невыполняемые дни: *«Off-days don't count against you or break the streak»*
- В аналитике при этом честно показываются **Frozen Days** как отдельный сигнал

### 10. Геймификация

**Virtue Points**: привычка +10 VP, strong day (7/9) +25, whole day (9/9) +50, streak multiplier
до 2×, perfect week +100. Уровни и тиры (Pilgrim → Apprentice → …). Экран «Level Reached».
**75 достижений** в 13 категориях (Streak, Whole Day, Consistency, Milestone, Journey, Nutrition,
Challenge, The Forge, The Hours, The Word, The Race, Examen, Virtue).

### 11. Литургический календарь как «нарративное время»

Сезоны (Advent, Lent, St. Michael's Lent, Christmas, Ordinary Time) с собственными правилами
(пятница — полный пост; в Великий пост добавляется среда; в Пасху и Рождество поста нет).
Святой дня в шапке. Сезонная «The Act» с отдельной задачей и своим измерением прогресса.

Это даёт продукту **ритм, не зависящий от личной серии пользователя** — время идёт, даже если ты
сорвался.

### 12. Прочее

Prayer-раздел (Литургия часов, Розарий, Библия по плану «The Narrative», вдохновляющие цитаты,
Beginner Starter Stack для новичков), виджет, Apple Health, iCloud, App Lock по Face ID,
Export My Data (JSON), Delete Account & Data, weekly email recap, share-карточки, темы (System/Light/Dark),
Day Boundary (когда начинается день), Replay Onboarding.

---

## Монетизация — самое поучительное

**HardRoad Annual $49.99/год, 14-дневный триал.** Но интереснее граница:

> *«Every prayer in this app is free, and always free — the Hours, the Bible, the saints, the Examen,
> the Shield. So is the Rule itself: the nine disciplines, your streaks, your Week in Review,
> Brotherhood, every share card, and everything you have already logged. **We will never charge you
> to pray, and we will never hold your record hostage.** Premium is the utility stack.»*

**Free Forever:** вся духовная практика, всё Правило, все твои данные, Week in Review, Brotherhood,
share-карточки, Begin Again.
**Premium:** тренировочный лог, питание/сканер штрихкодов, беговые зоны/VDOT, «глубокие цифры»
(Performance Dashboard, тренды Examen), программы тренировок.

То есть **платное — это утилиты, а не смысл продукта**. Ни рефлексия, ни собственные данные
пользователя не заперты за платой. Это редкая и сильная позиция.

---

## Что стоит перенять (и почему именно это)

Ранжировано по сочетанию «доказано наукой» × «ложится на нашу архитектуру».

1. **The Plan (implementation intentions).** Ложится идеально: у нас есть качества и контексты
   действий. «Когда [ситуация], я проявлю [качество]». Мета-анализ Gollwitzer & Sheeran: d = 0.65 —
   один из самых надёжных приёмов в поведенческой психологии. Реализуется как конструктор фразы,
   без единого психологического термина в интерфейсе.
2. **Защита серий (Freezes / Pause / «off-days don't count»).** Прямой ответ на задокументированный
   риск streak-тревоги. Если мы вообще вводим серии — только в таком виде. И их приём «показывать
   Frozen Days отдельным сигналом честности» стоит скопировать: пользователь не обманывает сам себя.
3. **Сезонная глубокая рефлексия (Rule of Life) → наши `development_cycles`.** У нас API готов,
   экранов нет. Их 26-шаговый поток — готовый шаблон того, чем цикл может открываться:
   struggle → почему это важно (0–10 + «почему не меньше?») → образ через год → идентичность
   («я становлюсь человеком, который…») → выбор качеств-якорей → «как я вернусь, если сорвусь» → фиксация.
4. **Градуированная оценка вместо бинарной.** Они пришли к severity Mild/Moderate/Severe для пороков —
   независимое подтверждение, что наша шкала 0–4 для качеств правильнее галочки. И их аналитика
   (Frequency × Severity → Concern Index) показывает, что из градуированных данных можно строить
   осмысленные метрики.
5. **Контентный слой на каждое качество (Toolkit).** У нас уже есть `ideals` (Марк Аврелий, Будда,
   Мандела) — естественная основа для «экземпляра» качества. Их «лестница эскалации» с вопросом
   «какая ступень твоя?» — сильный приём, применимый и к развитию качества, не только к пороку.
6. **Один вывод вместо стены цифр** («Your front this season», «One thing this week»). У нас уже
   считается сравнение «в рамках цели против обычного уровня» — из этого прямо выводится
   «твой фронт сейчас».
7. **Честность про недостаток данных** («Calibrating… Complete 3 more days») — вместо выдуманных
   инсайтов на трёх точках.
8. **Философия платного** — не запирать рефлексию и данные пользователя.

## Что сознательно НЕ переносить

- **Конфессиональную специфику.** Это их моат и их же потолок. Наш каталог (Живая Этика + классические
  добродетели) и три идеала из разных традиций — намеренно шире.
- **75 достижений + VP + уровни + множители.** Ровно та геймификация, о вреде которой говорят
  исследования, и она противоречит нашей позиции «спокойной технологии». Их же собственный
  freeze-механизм — признание проблемы.
- **9 фиксированных привычек.** У нас пользователь сам собирает набор качеств — гибче и ближе
  к реальной жизни.
- **Их объём контента как обязательство.** У них огромная библиотека (Литургия часов, Библия,
  жития). Это годы работы и постоянная редактура. Нам нужен принципиально более компактный
  контентный слой.

## Главный вывод для нас

Hard Road и Grit покрывают разные полюса: Grit — идеальная механика трекинга без смысла,
Hard Road — глубокий смысл на фиксированных привычках. **Ни один не делает того, что делаем мы:
не связывает произвольное реальное действие с несколькими качествами через градуированную оценку.**

Но Hard Road убедительно показывает то, чего нам не хватает: **вокруг ядра нужен слой практики**
(что конкретно сделать) **и слой смысла** (почему это качество, что оно такое, как оно рушится).
Голая аналитика — не продукт.
