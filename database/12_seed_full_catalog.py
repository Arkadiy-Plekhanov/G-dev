# -*- coding: utf-8 -*-
"""
Полный каталог качеств из "Цветка духовных качеств" (etikavomne.ru) --
заменяет MVP-набор из 25 на реальный объём (169). Расшифровано по тайлам
загруженного изображения (10 цветных секторов = 10 групп качеств,
заменяют временные 9 тематических групп MVP-фазы). Написания сверены
с сайтом там, где он был доступен статическим fetch (алфавит A-Impartiality,
~68 из 169) -- остальное прочитано только с изображения, без перекрёстной
проверки. Определения -- мои собственные краткие формулировки, не цитаты
с сайта (там -- цитаты из книг Агни Йоги под авторским правом).

Шесть идеал-специфичных понятий (aspiration, equanimity, fearlessness,
mindfulness, loving-kindness, reconciliation) на цветке отсутствуют --
это буддийские/стоические термины из состава идеалов Marcus Aurelius/
Buddha/Nelson Mandela, сохранены отдельно, чтобы идеалы не сломались
при замене каталога.
"""
import psycopg2
import psycopg2.extras
import os

DSN = os.environ.get("SEED_DSN", "dbname=selfdev user=postgres")

GROUPS = [
    ("wisdom", "Мудрость", 10),
    ("self_mastery", "Самообладание и стойкость", 20),
    ("love", "Любовь и сострадание", 30),
    ("culture", "Радость и культура", 40),
    ("affability", "Обходительность", 50),
    ("purity", "Чистота и дисциплина", 60),
    ("diligence", "Усердие", 70),
    ("activity", "Деятельность и отвага", 80),
    ("constancy", "Верность и постоянство", 90),
]

# slug -> (en_name, ru_name, en_definition, group_code, sort_order)
QUALITIES = {}

# --- wisdom ---
QUALITIES["sense-of-unity"] = ("Sense of Unity", "Чувство единства", "The felt awareness that all beings and things are ultimately connected.", "wisdom", 10)
QUALITIES["spirit-knowledge"] = ("Spirit-Knowledge", "Духознание", "Direct inner knowing that does not depend on external proof.", "wisdom", 20)
QUALITIES["wisdom"] = ("Wisdom", "Мудрость", "Living knowledge applied with discernment; seeing things as they are and acting rightly.", "wisdom", 30)
QUALITIES["a-sense-of-duty"] = ("A Sense of Duty", "Чувство долга", "An inner sense of what one owes to others, to one's work, and to one's own growth.", "wisdom", 40)
QUALITIES["consciousness"] = ("Consciousness", "Сознательность", "Clear, active awareness of one's own thoughts, actions, and their effects.", "wisdom", 50)
QUALITIES["desire-for-learning"] = ("Desire for Learning", "Стремление к познанию", "A genuine hunger to understand, warmed by care rather than mere curiosity.", "wisdom", 60)
QUALITIES["cognition"] = ("Cognition", "Познание", "The capacity to perceive and understand beyond surface appearances.", "wisdom", 70)
QUALITIES["straight-knowledge-of-spirit"] = ("Straight-Knowledge of Spirit", "Прямознание духа", "Insight that arrives directly, without the detour of formal reasoning.", "wisdom", 80)
QUALITIES["containment"] = ("Containment", "Вмещение", "The capacity to hold new and unfamiliar ideas without rejecting them out of hand.", "wisdom", 90)
QUALITIES["farsightedness-of-spirit"] = ("Farsightedness of Spirit", "Дальновидность духа", "The ability to sense the likely course of events well before they unfold.", "wisdom", 100)
QUALITIES["trust-faith"] = ("Trust, Faith", "Доверие, вера", "Confidence in the path forward that does not require constant proof.", "wisdom", 110)
QUALITIES["co-measurement-with-the-supreme"] = ("Co-measurement with the Supreme", "Сомерность с Высшим", "Weighing one's actions against the highest standard one recognizes, not against convenience.", "wisdom", 120)
QUALITIES["synthetics-of-consciousness"] = ("Synthetics of Consciousness", "Синтетичность сознания", "The ability to hold many strands of understanding together as one coherent whole.", "wisdom", 130)
QUALITIES["harmony"] = ("Harmony", "Гармония", "An inner and outer state in which one's parts and one's surroundings work together rather than against each other.", "wisdom", 140)
QUALITIES["sagacity"] = ("Sagacity", "Проницательность", "Sound, penetrating judgment drawn from experience rather than rules alone.", "wisdom", 150)
QUALITIES["receptivity"] = ("Receptivity", "Восприимчивость", "Openness to what is being offered -- an idea, a feeling, a person -- without premature judgment.", "wisdom", 160)
QUALITIES["insight"] = ("Insight", "Прозрение", "A sudden, clear grasp of what something truly means or requires.", "wisdom", 170)
QUALITIES["quick-wittedness"] = ("Quick-Wittedness", "Находчивость", "The ability to see the right response in the moment, without delay.", "wisdom", 180)
QUALITIES["practical-ingenuity"] = ("Practical Ingenuity", "Практическая смекалка", "Cleverness applied to real, immediate problems rather than abstract ones.", "wisdom", 190)
QUALITIES["foresight"] = ("Foresight", "Предусмотрительность", "Anticipating consequences before acting, so that details are not left to chance.", "wisdom", 200)
QUALITIES["discretion"] = ("Discretion", "Благоразумие", "Judging carefully what to say or do, and when to hold back.", "wisdom", 210)
QUALITIES["caution"] = ("Caution", "Осторожность", "Care taken before acting, distinct from fear -- caution moves forward carefully rather than not at all.", "wisdom", 220)
QUALITIES["responsibility"] = ("Responsibility", "Ответственность", "Owning the consequences of one's actions and choices, including the unintended ones.", "wisdom", 230)
QUALITIES["resistance-to-evil-by-spirit"] = ("Resistance to Evil by Spirit", "Противостояние злу духом", "Standing firm against wrongdoing through inner conviction rather than force.", "wisdom", 240)
QUALITIES["watchfulness"] = ("Watchfulness", "Бодрствование духа", "Staying inwardly awake to what is really happening, rather than drifting on habit.", "wisdom", 250)
QUALITIES["vigilance"] = ("Vigilance", "Бдительность", "Continued, active attention that does not relax once a danger seems to have passed.", "wisdom", 260)
QUALITIES["spiritual-imagination"] = ("Spiritual Imagination", "Духовное воображение", "The capacity to picture possibilities beyond what already exists.", "wisdom", 270)
QUALITIES["openness-assumption"] = ("Openness, Assumption", "Открытость, восприятие нового", "A readiness to consider what has not yet been proven or is unfamiliar.", "wisdom", 280)
QUALITIES["striving-to-the-future"] = ("Striving to the Future", "Устремление в будущее", "An orientation of thought and effort toward what is coming, not only what has been.", "wisdom", 290)
QUALITIES["sense-of-rhythm"] = ("Sense of Rhythm", "Чувство ритма", "An inner feel for timing and proportion in action and in life.", "wisdom", 300)
QUALITIES["inner-concordance"] = ("Inner Concordance", "Внутреннее согласие", "Agreement between one's thoughts, feelings, and actions.", "wisdom", 310)
QUALITIES["inner-integrity"] = ("Inner Integrity", "Внутренняя целостность", "Being undivided -- the same person in private as in public.", "wisdom", 320)

# --- self_mastery ---
QUALITIES["justice"] = ("Justice", "Справедливость", "Giving each situation and each person their due, without favor or prejudice.", "self_mastery", 10)
QUALITIES["discrimination"] = ("Discrimination", "Различение", "The ability to tell what matters from what does not, and truth from its imitation.", "self_mastery", 20)
QUALITIES["balance-equilibrium"] = ("Balance. Equilibrium", "Равновесие", "A gathered, steady inner state maintained even under pressure.", "self_mastery", 30)
QUALITIES["impartiality"] = ("Impartiality", "Беспристрастность", "Judging a matter on its merits, without being swayed by personal preference.", "self_mastery", 40)
QUALITIES["objectivity"] = ("Objectivity", "Объективность", "Seeing a situation as it actually is, apart from one's own wishes about it.", "self_mastery", 50)
QUALITIES["conscience"] = ("Conscience", "Совесть", "The inner voice that registers whether an action is right, independent of outside approval.", "self_mastery", 60)
QUALITIES["strictness-severity"] = ("Strictness. Severity", "Строгость", "Holding a firm standard, applied first of all to oneself.", "self_mastery", 70)
QUALITIES["keenness-of-sight"] = ("Keenness of Sight", "Зоркость", "A sharpened attentiveness that notices what others pass over.", "self_mastery", 80)
QUALITIES["alertness"] = ("Alertness", "Настороженность", "A readiness of attention that keeps one from being caught off guard.", "self_mastery", 90)
QUALITIES["clarity-of-consciousness"] = ("Clarity of Consciousness", "Ясность сознания", "A mind kept clear enough that thought and perception are not clouded by agitation.", "self_mastery", 100)
QUALITIES["nobility"] = ("Nobility", "Благородство", "A generosity and dignity of character that does not stoop to pettiness.", "self_mastery", 110)
QUALITIES["self-respect"] = ("Self-Respect", "Самоуважение", "A grounded sense of one's own worth that does not depend on others' approval.", "self_mastery", 120)
QUALITIES["self-control"] = ("Self-Control", "Самообладание", "Mastery over one's impulses and reactions, keeping the spirit balanced.", "self_mastery", 130)
QUALITIES["calmness-tranquillity"] = ("Calmness. Tranquillity", "Спокойствие", "An inner stillness that is not shaken by outer disturbance.", "self_mastery", 140)
QUALITIES["persistence-perseverance"] = ("Persistence. Perseverance", "Настойчивость", "Continuing toward a goal despite obstacles or setbacks.", "self_mastery", 150)
QUALITIES["firmness"] = ("Firmness", "Твёрдость", "Standing by one's convictions even when it would be easier not to.", "self_mastery", 160)
QUALITIES["relentlessness"] = ("Relentlessness", "Неуклонность", "Steady, unyielding pursuit of what one has set out to do.", "self_mastery", 170)
QUALITIES["reliability"] = ("Reliability", "Надёжность", "Being someone others can count on, consistently, over time.", "self_mastery", 180)
QUALITIES["dignity-of-spirit"] = ("Dignity of Spirit", "Достоинство духа", "An inner worth that remains intact regardless of outer circumstance.", "self_mastery", 190)
QUALITIES["freedom-of-spirit"] = ("Freedom of Spirit", "Свобода духа", "Inner independence from compulsion, whether from others or from one's own lower impulses.", "self_mastery", 200)
QUALITIES["composure"] = ("Composure", "Самообладание в действии", "Remaining steady and clear-headed under strain.", "self_mastery", 210)
QUALITIES["steadfastness"] = ("Steadfastness", "Стойкость", "Remaining constant in purpose and conviction over time.", "self_mastery", 220)
QUALITIES["endurance-fortitude"] = ("Endurance. Fortitude", "Выносливость", "The capacity to bear hardship without breaking.", "self_mastery", 230)
QUALITIES["reserve"] = ("Reserve", "Сдержанность", "Restraint in what one reveals, kept in service of judgment rather than secrecy for its own sake.", "self_mastery", 240)

# --- love ---
QUALITIES["reverence-of-the-highest"] = ("Reverence of the Highest", "Почитание Высшего", "A deep respect held toward what one recognizes as greater than oneself.", "love", 10)
QUALITIES["love"] = ("Love", "Любовь", "The synthetic, foundational quality from which the other positive qualities spring; a selfless, uniting force.", "love", 20)
QUALITIES["giving"] = ("Giving", "Отдача", "Offering of oneself -- attention, help, resources -- without keeping score.", "love", 30)
QUALITIES["cordiality"] = ("Cordiality", "Сердечность", "Genuine warmth extended toward others, from the heart rather than as form.", "love", 40)
QUALITIES["compassion"] = ("Compassion", "Сострадание", "Feeling another's difficulty as if it were one's own, and being moved to help.", "love", 50)
QUALITIES["self-sacrifice"] = ("Self-Sacrifice", "Самопожертвование", "Willingly setting aside one's own interest for the sake of something greater.", "love", 60)
QUALITIES["humility"] = ("Humility", "Смирение", "A realistic sense of one's own place, free of both arrogance and self-abasement.", "love", 70)
QUALITIES["self-denial"] = ("Self-Denial", "Самоотречение", "Setting aside one's own wants when a higher purpose calls for it.", "love", 80)
QUALITIES["unselfishness"] = ("Unselfishness", "Бескорыстие", "Acting for others' benefit without expecting personal return.", "love", 90)
QUALITIES["generosity"] = ("Generosity", "Щедрость", "Giving freely, without counting or holding back.", "love", 100)
QUALITIES["gratitude"] = ("Gratitude", "Благодарность", "A felt recognition of what one has received, and the wish to honor it.", "love", 110)
QUALITIES["appreciation"] = ("Appreciation", "Признательность", "Valuing what is good in someone or something, and letting that be known.", "love", 120)
QUALITIES["love-of-mankind"] = ("Love of Mankind", "Человеколюбие", "A basic goodwill extended toward people in general, not only to those close to us.", "love", 130)
QUALITIES["mercy"] = ("Mercy", "Милосердие", "Choosing kindness toward someone even when a harsher response would be justified.", "love", 140)
QUALITIES["sympathy"] = ("Sympathy", "Сочувствие", "Sharing, in feeling, in what another person is going through.", "love", 150)
QUALITIES["carefulness"] = ("Carefulness", "Заботливость", "Attentive concern for another's wellbeing, expressed in small, consistent acts.", "love", 160)
QUALITIES["eagerness-to-help"] = ("Eagerness to Help", "Готовность помочь", "A readiness to assist that does not wait to be asked.", "love", 170)
QUALITIES["lenience"] = ("Lenience", "Снисходительность", "Choosing a gentler judgment of another's fault than strict accounting would allow.", "love", 180)
QUALITIES["non-condemnation-ability-to-forgive"] = ("Non Condemnation. Ability to Forgive", "Неосуждение, умение прощать", "Releasing blame toward someone who has wronged you, and choosing not to hold it against them.", "love", 190)
QUALITIES["kindness-love-of-good"] = ("Kindness. Love of Good", "Доброта, любовь к добру", "A disposition toward gentleness and goodwill as one's default response to others.", "love", 200)
QUALITIES["readiness-to-sacrifice"] = ("Readiness to Sacrifice", "Готовность к жертве", "Being prepared, in advance, to give up something of one's own for the sake of another or a higher aim.", "love", 210)
QUALITIES["selflessness"] = ("Selflessness", "Самоотверженность", "Placing others' good ahead of one's own convenience, as a settled habit rather than an exception.", "love", 220)
QUALITIES["serving-the-common-good"] = ("Serving the Common Good", "Служение общему благу", "Directing one's effort toward what benefits people beyond oneself.", "love", 230)
QUALITIES["ability-to-help"] = ("Ability to Help", "Умение помогать", "Not just the wish to help, but the practical skill of doing it well.", "love", 240)
QUALITIES["humaneness"] = ("Humaneness", "Человечность", "Treating people, above all, as people -- with the regard due to any human being.", "love", 250)
QUALITIES["solicitude"] = ("Solicitude", "Попечение", "Careful, ongoing attention to another's needs and welfare.", "love", 260)
QUALITIES["tolerance"] = ("Tolerance", "Терпимость", "Accepting difference in others' views and ways without needing them to match one's own.", "love", 270)
QUALITIES["responsiveness"] = ("Responsiveness", "Отзывчивость", "Being quick to notice and answer another's need.", "love", 280)
QUALITIES["magnanimity"] = ("Magnanimity", "Великодушие", "A largeness of spirit that overlooks slights and gives others the benefit of the doubt.", "love", 290)

# --- culture ---
QUALITIES["benevolence"] = ("Benevolence", "Благожелательность", "A settled wish for others' good, extended even before it is earned.", "culture", 10)
QUALITIES["culture"] = ("Culture", "Культура", "Refinement carried into every part of life -- thought, taste, and conduct alike.", "culture", 20)
QUALITIES["joy"] = ("Joy", "Радость", "A special wisdom -- a lightness of spirit that comes from meaning, not from circumstance.", "culture", 30)
QUALITIES["sense-of-beauty"] = ("Sense of Beauty", "Чувство красоты", "The capacity to notice and be moved by what is beautiful.", "culture", 40)
QUALITIES["complacency"] = ("Complacency", "Благодушие", "A settled, unruffled goodwill that is not easily provoked.", "culture", 50)
QUALITIES["friendliness"] = ("Friendliness", "Дружелюбие", "An open, welcoming manner toward others, freely offered.", "culture", 60)
QUALITIES["striving-for-cooperation"] = ("Striving for Cooperation", "Стремление к сотрудничеству", "Actively seeking to work together with others rather than alone or against them.", "culture", 70)
QUALITIES["peacefulness"] = ("Peacefulness", "Миролюбие", "A disposition toward calm and concord rather than conflict.", "culture", 80)
QUALITIES["patriotism"] = ("Patriotism", "Патриотизм", "A committed care for the wellbeing of one's own country and people.", "culture", 90)
QUALITIES["enthusiasm"] = ("Enthusiasm", "Энтузиазм", "A kindling energy that makes effort feel lighter and carries others along.", "culture", 100)
QUALITIES["victory-of-spirit"] = ("Victory of Spirit", "Победа духа", "An inner triumph over one's own weaknesses or fears.", "culture", 110)
QUALITIES["optimism"] = ("Optimism", "Оптимизм", "Expecting good outcomes and approaching difficulty with hope rather than dread.", "culture", 120)
QUALITIES["solemnity"] = ("Solemnity", "Торжественность", "A gravity of bearing appropriate to what truly matters.", "culture", 130)
QUALITIES["refinement"] = ("Refinement", "Утончённость", "A quality of perception and taste sharpened through sustained attention.", "culture", 140)

# --- affability ---
QUALITIES["affectionateness"] = ("Affectionateness", "Ласковость", "Warmth expressed through small, tender gestures toward others.", "affability", 10)
QUALITIES["tenderness"] = ("Tenderness", "Нежность", "A gentle, careful warmth, especially toward those who are vulnerable.", "affability", 20)
QUALITIES["affability"] = ("Affability", "Приветливость", "An easy, approachable warmth in how one meets others.", "affability", 30)
QUALITIES["charm"] = ("Charm", "Обаяние", "A quality that draws others in, rooted in genuine warmth rather than performance.", "affability", 40)
QUALITIES["tactfulness"] = ("Tactfulness", "Тактичность", "Sensing what to say, and how, so as not to wound unnecessarily.", "affability", 50)
QUALITIES["delicacy"] = ("Delicacy", "Деликатность", "An exquisitely attentive and considerate regard for others' feelings and circumstances.", "affability", 60)
QUALITIES["politeness"] = ("Politeness", "Вежливость", "Consistent, ordinary courtesy shown to others.", "affability", 70)
QUALITIES["invigoration"] = ("Invigoration", "Ободрение", "Lifting others' spirits through one's presence or words.", "affability", 80)
QUALITIES["conviction"] = ("Conviction", "Убеждённость", "A settled, persuasive confidence in what one holds to be true.", "affability", 90)
QUALITIES["confidence"] = ("Confidence", "Уверенность", "A grounded trust in one's own capacity, distinct from conceit.", "affability", 100)
QUALITIES["inspiration"] = ("Inspiration", "Вдохновение", "A lifted state of mind that draws out one's best effort.", "affability", 110)
QUALITIES["loftiness"] = ("Loftiness", "Возвышенность", "An elevated quality of thought or bearing, aimed above the ordinary.", "affability", 120)
QUALITIES["freshness-of-perception"] = ("Freshness of Perception", "Свежесть восприятия", "Seeing familiar things as if for the first time, undulled by routine.", "affability", 130)
QUALITIES["sensitivity"] = ("Sensitivity", "Чуткость", "A fine responsiveness to subtle signals -- in others, and in oneself.", "affability", 140)
QUALITIES["truthfulness"] = ("Truthfulness", "Правдивость", "Speaking and representing things as they actually are.", "affability", 150)

# --- purity ---
QUALITIES["purity"] = ("Purity", "Чистота", "Freedom from what corrupts or distorts -- in motive, in thought, in conduct.", "purity", 10)
QUALITIES["simplicity"] = ("Simplicity", "Простота", "Directness and clarity, free of unnecessary complication or pretense.", "purity", 20)
QUALITIES["striving-for-perfection"] = ("Striving for Perfection", "Стремление к совершенству", "A continual reaching to do and be better, without settling.", "purity", 30)
QUALITIES["creativity"] = ("Creativity", "Творчество", "The capacity to bring something new into being through thought, word, or action.", "purity", 40)
QUALITIES["honesty"] = ("Honesty", "Честность", "Truthfulness and integrity in word and deed.", "purity", 50)
QUALITIES["sincerity"] = ("Sincerity", "Искренность", "Meaning what one says, without a hidden second layer.", "purity", 60)
QUALITIES["detachment"] = ("Detachment", "Отрешённость", "Holding things and outcomes loosely, without being possessed by them.", "purity", 70)
QUALITIES["sense-of-proportion"] = ("Sense of Proportion", "Чувство меры", "Knowing how much weight to give a thing -- neither too much nor too little.", "purity", 80)
QUALITIES["self-sufficiency"] = ("Self-Sufficiency", "Самодостаточность", "Being able to stand on one's own resources without constant external support.", "purity", 90)
QUALITIES["organization"] = ("Organization", "Организованность", "Ordering one's effort and materials so that work can proceed cleanly.", "purity", 100)
QUALITIES["discipline"] = ("Discipline", "Дисциплина", "Consistent, self-imposed order applied to one's own conduct.", "purity", 110)
QUALITIES["precision"] = ("Precision", "Точность", "Exactness in thought, word, and action.", "purity", 120)
QUALITIES["precision-of-consciousness"] = ("Precision of Consciousness", "Точность сознания", "Exactness carried inward -- clear, undistorted perception of one's own mental state.", "purity", 130)
QUALITIES["dispassion"] = ("Dispassion", "Беспристрастие чувств", "Mastery over one's feelings, not their absence.", "purity", 140)
QUALITIES["restraint"] = ("Restraint", "Сдержанность", "Holding back an impulse until it can be expressed rightly.", "purity", 150)
QUALITIES["modesty"] = ("Modesty", "Скромность", "Not overstating one's own importance or contribution.", "purity", 160)
QUALITIES["brevity"] = ("Brevity", "Немногословие", "Saying only what is needed, and no more.", "purity", 170)
QUALITIES["concentration"] = ("Concentration", "Сосредоточенность", "Gathering scattered attention into one undivided focus.", "purity", 180)
QUALITIES["attentiveness"] = ("Attentiveness", "Внимательность", "Sustained, careful notice of what is in front of one.", "purity", 190)
QUALITIES["power-of-observation"] = ("Power of Observation", "Наблюдательность", "The trained ability to notice detail that others miss.", "purity", 200)
QUALITIES["conscientiousness"] = ("Conscientiousness", "Добросовестность", "Doing one's work carefully and honestly, whether or not anyone is watching.", "purity", 210)

# --- diligence ---
QUALITIES["valour"] = ("Valour", "Доблесть", "Courage shown in action, especially under difficulty.", "diligence", 10)
QUALITIES["originality"] = ("Originality", "Самобытность", "Thinking and acting from one's own genuine understanding, not imitation.", "diligence", 20)
QUALITIES["self-dependence"] = ("Self-Dependence", "Самостоятельность", "Relying on one's own judgment and effort rather than leaning on others.", "diligence", 30)
QUALITIES["diligence"] = ("Diligence", "Прилежание", "Steady, careful effort applied to one's work over time.", "diligence", 40)

# --- activity ---
QUALITIES["courage"] = ("Courage", "Мужество", "Fearless firmness of spirit in the face of difficulty; acting rightly despite fear.", "activity", 10)
QUALITIES["heroism"] = ("Heroism", "Героизм", "Acting selflessly and decisively for the common good, at real cost to oneself.", "activity", 20)
QUALITIES["striving"] = ("Striving", "Устремление", "A sustained inner drive toward growth or a chosen goal.", "activity", 30)
QUALITIES["devotion"] = ("Devotion", "Преданность", "Steadfast, unwavering faithfulness to the higher and to one's own path.", "activity", 40)
QUALITIES["patience"] = ("Patience", "Терпение", "Calm endurance and perseverance; bearing difficulty without losing balance.", "activity", 50)
QUALITIES["the-strength-of-spirit-will"] = ("The Strength of Spirit Will", "Сила духа воли", "The force of will that carries a person through when circumstances resist.", "activity", 60)
QUALITIES["spiritual-tension"] = ("Spiritual Tension", "Духовное напряжение", "An active, gathered readiness of spirit, not passive calm.", "activity", 70)
QUALITIES["readiness"] = ("Readiness", "Готовность", "Being prepared to act the moment the situation calls for it.", "activity", 80)
QUALITIES["intrepidity"] = ("Intrepidity", "Неустрашимость", "Facing danger or difficulty without being deterred by it.", "activity", 90)
QUALITIES["bravery"] = ("Bravery", "Храбрость", "Willingness to face danger or difficulty directly.", "activity", 100)
QUALITIES["self-activity"] = ("Self-Activity", "Самодеятельность", "Acting from one's own initiative rather than waiting to be moved by others.", "activity", 110)
QUALITIES["love-of-labor"] = ("Love of Labor", "Любовь к труду", "Finding genuine satisfaction in the work itself, not only its results.", "activity", 120)
QUALITIES["aspiration-for-the-highest-quality"] = ("Aspiration for the Highest Quality", "Устремление к высшему качеству", "Holding the highest standard as the aim in whatever one does, however small.", "activity", 130)
QUALITIES["efficiency"] = ("Efficiency", "Действенность", "Effort that actually accomplishes what it sets out to do.", "activity", 140)
QUALITIES["activity"] = ("Activity", "Активность", "Engaged, purposeful action rather than passivity.", "activity", 150)
QUALITIES["initiative"] = ("Initiative", "Инициативность", "Starting action on one's own, without needing to be told.", "activity", 160)
QUALITIES["orderliness"] = ("Orderliness", "Аккуратность", "Keeping one's affairs and surroundings in good order.", "activity", 170)
QUALITIES["determination-resoluteness"] = ("Determination. Resoluteness", "Решительность", "A firm, settled resolve to see a course of action through.", "activity", 180)
QUALITIES["audacity"] = ("Audacity", "Дерзновение", "Boldness of thought or action that is willing to go beyond the familiar.", "activity", 190)

# --- constancy ---
QUALITIES["loyalty"] = ("Loyalty", "Верность", "Steadfast faithfulness to a person, cause, or commitment over time.", "constancy", 10)
QUALITIES["constancy"] = ("Constancy", "Постоянство", "Remaining the same in purpose and character across changing circumstances.", "constancy", 20)
QUALITIES["strength-of-spirit"] = ("Strength of Spirit", "Сила духа", "An inner fortitude that does not depend on outer support.", "constancy", 30)
QUALITIES["daring"] = ("Daring", "Дерзание", "A willingness to attempt what has not been attempted, in service of growth.", "constancy", 40)
QUALITIES["resourcefulness"] = ("Resourcefulness", "Находчивость в действии", "Finding a way forward with whatever is at hand.", "constancy", 50)
QUALITIES["impetuosity"] = ("Impetuosity", "Порывистость", "Quick, energetic action taken without long hesitation.", "constancy", 60)
QUALITIES["mobility-adaptability"] = ("Mobility. Adaptability", "Подвижность", "The capacity to adjust readily to new circumstances.", "constancy", 70)
QUALITIES["flexibility-of-consciousness"] = ("Flexibility of Consciousness", "Гибкость сознания", "The capacity to shift one's own frame of understanding when the situation requires it.", "constancy", 80)
QUALITIES["cheerfulness-of-spirit"] = ("Cheerfulness of Spirit", "Бодрость духа", "A resilient lightness that persists even through difficulty.", "constancy", 90)
QUALITIES["protection-of-secrecy"] = ("Protection of Secrecy", "Хранение тайны", "The discipline of keeping what should not be shared, undisclosed.", "constancy", 100)
QUALITIES["indefatigability"] = ("Indefatigability", "Неутомимость", "The capacity to keep going without being worn down.", "constancy", 110)

# Идеалы: композиции полностью на слагах с цветка -- ни одной внецветочной
# добавки (владелец справедливо отметил: они дублировали уже имеющееся).
# 17 из 25 старых MVP-качеств нашли прямое соответствие на цветке; 2
# переименованы под цветочные slug'и (forgiveness ->
# non-condemnation-ability-to-forgive, perseverance ->
# persistence-perseverance); 4 не имели аналога на цветке и заменены
# ближайшим по смыслу цветочным качеством:
#   equanimity     -> balance-equilibrium   (тот же смысл: устойчивая
#                      собранность, не колеблющаяся от обстоятельств)
#   mindfulness    -> attentiveness         (то же: устойчивое, неоценочное
#                      внимание к происходящему здесь и сейчас)
#   loving-kindness -> kindness-love-of-good (буквальное совпадение смысла)
#   reconciliation -> peacefulness          (у Манделы уже есть "прощение"
#                      отдельным пунктом -- reconciliation здесь про
#                      восстановление мира, не про сам акт прощения)
# aspiration и fearlessness убраны без замены: они не входили ни в одну
# из трёх композиций идеалов -- были неиспользуемым остатком старого
# MVP-набора из 25.
IDEAL_QUALITY_SLUGS = {
    "marcus-aurelius": ["wisdom", "courage", "justice", "self-control", "discipline", "balance-equilibrium"],
    "buddha": ["wisdom", "compassion", "balance-equilibrium", "self-control", "attentiveness",
               "patience", "kindness-love-of-good"],
    "nelson-mandela": ["non-condemnation-ability-to-forgive", "peacefulness", "courage",
                        "persistence-perseverance", "humility", "justice", "compassion"],
}


def main():
    conn = psycopg2.connect(DSN)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        # 1. Группы: MVP-набор из 9 тематических кодов заменяется на 9
        # цветочных -- ON CONFLICT здесь не подходит (коды другие), поэтому
        # TRUNCATE CASCADE. Каскад заденет catalog_qualities.group_id (FK) --
        # это ожидаемо, ниже сразу пересидим catalog_qualities целиком.
        cur.execute("TRUNCATE quality_groups CASCADE")
        for code, label, sort in GROUPS:
            cur.execute(
                "INSERT INTO quality_groups (code, label, sort_order) VALUES (%s, %s, %s)",
                (code, label, sort),
            )
        cur.execute("SELECT id, code FROM quality_groups")
        group_ids = {row["code"]: row["id"] for row in cur.fetchall()}
        print(f"quality_groups: {len(group_ids)} групп")

        # 2. Каталог качеств: TRUNCATE CASCADE каскадом заденет
        # ideal_qualities и user_qualities -- корректно для dev/CI (нет
        # реальных пользовательских данных на этом этапе проекта), но это
        # разрушительная операция -- НЕ запускать против БД с живыми данными
        # пользователей без отдельного плана миграции их user_qualities.
        cur.execute("TRUNCATE catalog_qualities CASCADE")
        quality_ids = {}
        for slug, (en, ru, definition, group_code, sort) in QUALITIES.items():
            cur.execute(
                """INSERT INTO catalog_qualities (slug, name, definition, group_id, sort_order)
                   VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                (slug, psycopg2.extras.Json({"en": en, "ru": ru}),
                 psycopg2.extras.Json({"en": definition}),
                 group_ids[group_code], sort),
            )
            quality_ids[slug] = cur.fetchone()["id"]
        print(f"catalog_qualities: {len(quality_ids)} качеств")

        # 3. Идеалы уже существуют (не заданы этим сидом) -- пересобираем
        # только их состав (ideal_qualities), используя новые id.
        cur.execute("SELECT id, slug FROM ideals")
        ideal_ids = {row["slug"]: row["id"] for row in cur.fetchall()}
        total_links = 0
        for ideal_slug, quality_slugs in IDEAL_QUALITY_SLUGS.items():
            if ideal_slug not in ideal_ids:
                print(f"  !! идеал '{ideal_slug}' не найден в таблице ideals -- пропущен")
                continue
            for rank, q_slug in enumerate(quality_slugs, start=1):
                if q_slug not in quality_ids:
                    print(f"  !! качество '{q_slug}' (для {ideal_slug}) не найдено -- пропущено")
                    continue
                cur.execute(
                    "INSERT INTO ideal_qualities (ideal_id, catalog_quality_id, rank) VALUES (%s, %s, %s)",
                    (ideal_ids[ideal_slug], quality_ids[q_slug], rank),
                )
                total_links += 1
        print(f"ideal_qualities: {total_links} связей пересобрано")

        conn.commit()
        print("COMMIT ok")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
