"""
Сид глобального каталога качеств и идеалов -- рабочий MVP-набор
(25 качеств вместо полных ~150, 3 идеала вместо 6 -- решение владельца
об урезании до 3 для MVP). Контент -- из research-раунда 2 (etikavomne.ru
для качеств; академические/традиционные источники для идеалов).

Параметризованные запросы (не сырой SQL), потому что английские
определения содержат апострофы (one's, isn't и т.п.) -- ручное
экранирование в SQL-литералах это тот класс ошибок, который проще
исключить инструментом, чем аккуратностью.
"""
import psycopg2
import psycopg2.extras
import uuid

import os

DSN = os.environ.get("SEED_DSN", "dbname=selfdev user=postgres")
# ВАЖНО: сидирование ГЛОБАЛЬНОГО каталога -- операция администрирования/
# деплоя, не рантайм-операция приложения. app_writer намеренно имеет
# только SELECT на catalog_qualities/ideals/ideal_qualities (продукт
# курирует контент, не пользователи через API) -- поэтому сидировать
# нужно от более привилегированного подключения (здесь -- postgres),
# не от той же роли, что использует сам бэкенд.

# slug -> (en_name, ru_name, en_def, ru_source, group_code)
QUALITIES = {
    "love": ("Love", "Любовь",
        "The synthetic, foundational quality from which all other positive qualities spring; a selfless, creative force uniting all beings.",
        "«Любовь глубоко синтетичное и стержнеобразующее качество… Невозможно назвать ни одного положительного нравственного качества, которое бы не имело ее своим истоком.»",
        "relationships"),
    "devotion": ("Devotion", "Преданность",
        "Steadfast, unwavering faithfulness to the higher and to one's own path; linked to constancy, reliability and firmness.",
        "«Преданность есть основа духовности»; близкие понятия: верность, постоянство, надежность, стойкость.",
        "will"),
    "self-sacrifice": ("Selflessness", "Самоотверженность",
        "Readiness to give of oneself in service of the common good; heroism and service without self-interest.",
        "близкие понятия: героизм, дерзание, самоотречение, служение Общему Благу, бескорыстие.",
        "responsibility"),
    "wisdom": ("Wisdom", "Мудрость",
        "Living knowledge applied with discernment; the capacity to see things as they are and act rightly.",
        "из состава «Цветка духовных качеств» (познавательные качества).",
        "intellect"),
    "courage": ("Courage", "Мужество",
        "Fearless firmness of spirit in the face of difficulty; acting rightly despite fear.",
        "«…мужество, торжественность, спокойствие и преданность дают аккорд завершенный.»",
        "will"),
    "patience": ("Patience", "Терпение",
        "Calm endurance and perseverance; the ability to bear difficulty without losing balance.",
        "из состава «Цветка духовных качеств».",
        "self_control"),
    "self-control": ("Self-control", "Самообладание",
        "Mastery over one's impulses and reactions; composure that keeps the spirit balanced.",
        "из состава «Цветка духовных качеств» (волевые качества).",
        "self_control"),
    "honesty": ("Honesty", "Честность",
        "Truthfulness and integrity in word and deed; sincerity.",
        "«Это любовь, доброжелательность, радость, мужество, решительность, активность, честность, трудолюбие, терпение…»",
        "morality"),
    "compassion": ("Compassion", "Сострадание",
        "Active empathy for the suffering of others and the wish to relieve it; benevolence.",
        "из состава «Цветка духовных качеств».",
        "relationships"),
    "gratitude": ("Gratitude", "Признательность",
        "Recognition and thankful acknowledgment of good received; a quality of the open heart.",
        "из состава «Цветка духовных качеств».",
        "relationships"),
    "justice": ("Justice", "Справедливость",
        "Fairness and right measure in dealings with others; giving each their due.",
        "из состава «Цветка духовных качеств».",
        "morality"),
    "discipline": ("Discipline", "Дисциплина",
        "Ordered, consistent self-governance directed toward growth; industriousness.",
        "«…трудолюбие…» и волевые качества «Цветка».",
        "will"),
    "humility": ("Humility", "Смирение",
        "Modest self-awareness free of pride; seeing oneself and others truly.",
        "из состава «Цветка духовных качеств».",
        "morality"),
    "loyalty": ("Loyalty", "Верность",
        "Reliable steadfastness toward people, principles and one's own path.",
        "близкие понятия к «Преданности»: верность, постоянство, надежность.",
        "relationships"),
    "aspiration": ("Aspiration", "Устремлённость",
        "Directed striving of the spirit toward the higher; the impulse of growth.",
        "«Устремление к Высшему должно быть явлением самым насущным.»",
        "will"),
    "constancy": ("Constancy", "Постоянство",
        "Unbroken steadiness and perseverance over time; not wavering.",
        "близкие понятия к «Преданности»: постоянство, неотступность, непоколебимость.",
        "will"),
    "equanimity": ("Equanimity", "Равновесие",
        "Inner poise and calm that yields sound judgment; psychic balance.",
        "«Пусть все решения взвешивает разумом и сердцем, ибо лишь это равновесие даст верное решение.»",
        "self_control"),
    "simplicity": ("Simplicity", "Простота",
        "Unaffected directness and freedom from excess; naturalness of spirit.",
        "близкие понятия в статьях «Цветка»: простота.",
        "morality"),
    "tolerance": ("Tolerance", "Терпимость",
        "Acceptance and respect for differences; seeing the value in each path.",
        "«…мы учились видеть красоту в каждой религии.»",
        "relationships"),
    "fearlessness": ("Fearlessness", "Бесстрашие",
        "Freedom from fear grounded in strength of spirit; the fiery will in action.",
        "«Стойкость, непоколебимость, преданность несломимая, бесстрашие, твердость…»",
        "will"),
    # Добавлены под композиции конкретных идеалов (research-раунд 2, блок 5) --
    # не из прямого текста etikavomne.ru, помечено честно ниже.
    "mindfulness": ("Mindfulness", "Осознанность",
        "Full, non-judgmental attention to the present moment; clear awareness of one's thoughts, feelings and actions as they arise.",
        "не из etikavomne.ru напрямую; буддийская традиция (sati), добавлено для композиции идеала Будда.",
        "awareness"),
    "loving-kindness": ("Loving-kindness", "Доброжелательность",
        "Active goodwill and warmth extended to all beings without exception; the wish for others' wellbeing.",
        "не из etikavomne.ru напрямую; буддийская традиция (metta), добавлено для композиции идеала Будда.",
        "relationships"),
    "forgiveness": ("Forgiveness", "Прощение",
        "The conscious release of resentment toward those who have caused harm, without denying the harm itself.",
        "не из etikavomne.ru напрямую; добавлено для композиции идеала Нельсон Мандела.",
        "morality"),
    "reconciliation": ("Reconciliation", "Примирение",
        "The rebuilding of right relationship after conflict or injury; choosing a shared future over division.",
        "не из etikavomne.ru напрямую; добавлено для композиции идеала Нельсон Мандела.",
        "relationships"),
    "perseverance": ("Perseverance", "Настойчивость",
        "Steady effort sustained through hardship and setbacks, without giving up on what matters.",
        "не из etikavomne.ru напрямую; добавлено для композиции идеала Нельсон Мандела.",
        "will"),
}

IDEALS = {
    "marcus-aurelius": (
        "Marcus Aurelius", "Марк Аврелий", "philosophers",
        "Roman emperor (161-180 CE) and Stoic philosopher whose private notebook, the \"Meditations,\" "
        "remains a classic of practical philosophy. He sought to govern himself and the empire by reason, "
        "duty and self-restraint.",
        ["wisdom", "courage", "justice", "self-control", "discipline", "equanimity"],
    ),
    "buddha": (
        "Buddha", "Будда", "spiritual",
        "A teacher of the 6th-5th century BCE in ancient India whose insight into the nature of suffering "
        "gave rise to Buddhism. His Noble Eightfold Path sets out an ethical and contemplative way of life "
        "centered on wisdom, compassion and mindful discipline.",
        ["wisdom", "compassion", "equanimity", "self-control", "mindfulness", "patience", "loving-kindness"],
    ),
    "nelson-mandela": (
        "Nelson Mandela", "Нельсон Мандела", "leaders",
        "South African leader (1918-2013) who spent 27 years in prison, then guided his country peacefully "
        "out of apartheid and became its first democratically elected president. He is remembered worldwide "
        "for reconciliation and dignity.",
        ["forgiveness", "reconciliation", "courage", "perseverance", "humility", "justice", "compassion"],
    ),
}


def main():
    conn = psycopg2.connect(DSN)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT id, code FROM quality_groups")
    group_id = {row["code"]: row["id"] for row in cur.fetchall()}

    quality_id = {}
    for slug, (en, ru, en_def, ru_source, group_code) in QUALITIES.items():
        qid = str(uuid.uuid4())
        quality_id[slug] = qid
        cur.execute(
            """INSERT INTO catalog_qualities (id, slug, name, definition, group_id, sort_order)
               VALUES (%s, %s, %s::jsonb, %s::jsonb, %s, %s)""",
            (
                qid, slug,
                psycopg2.extras.Json({"en": en, "ru": ru}),
                psycopg2.extras.Json({"en": en_def, "ru_source": ru_source}),
                group_id.get(group_code),
                len(quality_id) * 10,
            ),
        )
    print(f"catalog_qualities: {len(quality_id)}")

    for i, (slug, (en, ru, category, bio, quality_slugs)) in enumerate(IDEALS.items()):
        iid = str(uuid.uuid4())
        cur.execute(
            """INSERT INTO ideals (id, slug, name, bio, category, sort_order)
               VALUES (%s, %s, %s::jsonb, %s::jsonb, %s, %s)""",
            (
                iid, slug,
                psycopg2.extras.Json({"en": en, "ru": ru}),
                psycopg2.extras.Json({"en": bio}),
                category, i * 10,
            ),
        )
        for rank, qslug in enumerate(quality_slugs, start=1):
            cur.execute(
                "INSERT INTO ideal_qualities (ideal_id, catalog_quality_id, rank) VALUES (%s, %s, %s)",
                (iid, quality_id[qslug], rank),
            )
        print(f"ideal: {en} -> {len(quality_slugs)} качеств")

    conn.commit()
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
