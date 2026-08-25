BEGIN;

-- ============================================================
-- Глобальный каталог качеств (без user_id, без RLS -- reference-данные,
-- курируются продуктом, не пользователем -- решение владельца #5).
-- i18n: JSONB {"en":..., "ru":...} на MVP (ADR v2 §6) -- английский
-- основной для международного продукта, русский -- трассировка
-- к исходнику etikavomne.ru.
-- ============================================================
CREATE TABLE catalog_qualities (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         text NOT NULL UNIQUE,
    name         jsonb NOT NULL,            -- {"en": "Courage", "ru": "Мужество"}
    definition   jsonb NOT NULL,            -- {"en": "...", "ru_source": "..."}
    group_id     smallint REFERENCES quality_groups(id),
    sort_order   integer NOT NULL DEFAULT 0,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Идеалы -- курируемые образы, задающие композицию качеств одним
-- из трёх равноценных путей построения фокуса (ADR v2 §2).
-- ============================================================
CREATE TABLE ideals (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug           text NOT NULL UNIQUE,
    name           jsonb NOT NULL,
    bio            jsonb NOT NULL,           -- короткая нейтральная биографическая справка
    category       text NOT NULL,            -- spiritual | historical | philosophers | leaders
    portrait_asset text,
    sort_order     integer NOT NULL DEFAULT 0,
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ideal_qualities (
    ideal_id           uuid NOT NULL REFERENCES ideals(id) ON DELETE CASCADE,
    catalog_quality_id uuid NOT NULL REFERENCES catalog_qualities(id) ON DELETE CASCADE,
    rank               smallint NOT NULL,     -- 1 = наиболее характерное качество идеала
    PRIMARY KEY (ideal_id, catalog_quality_id)
);
CREATE INDEX idx_ideal_qualities_ideal ON ideal_qualities(ideal_id, rank);

ALTER TABLE users ADD COLUMN chosen_ideal_id uuid REFERENCES ideals(id);
-- "Мой идеал" -- UX-метка источника композиции на момент выбора, не
-- постоянная связь: дальнейшее редактирование фокуса идеала не касается
-- (ADR v2 §2 -- "идеал: генератор композиции, не постоянная связь").

-- ============================================================
-- user_qualities -- персональное "принятие" качества пользователем.
-- Заменяет прежнюю полностью персональную qualities: качество теперь
-- всегда ссылается на глобальный каталог (решение владельца #5:
-- кастомные качества не нужны -- catalog_quality_id NOT NULL).
-- ============================================================
CREATE TABLE user_qualities (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    legacy_code        text,
    catalog_quality_id uuid NOT NULL REFERENCES catalog_qualities(id),
    dev_priority_type  text NOT NULL DEFAULT 'priority',
    dev_priority_code  text NOT NULL,
    focus_type         text NOT NULL DEFAULT 'quality_focus',
    focus_code         text NOT NULL,
    dev_status_type    text NOT NULL DEFAULT 'quality_dev_status',
    dev_status_code    text NOT NULL,
    current_level      smallint CHECK (current_level BETWEEN 0 AND 4),
    last_reviewed_at   date,
    next_review_at     date,
    source             text NOT NULL DEFAULT 'manual' CHECK (source IN ('ideal', 'manual', 'test')),
    source_ideal_id    uuid REFERENCES ideals(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_user_qualities_user_id UNIQUE (user_id, id),                 -- цель composite FK из quality_expressions
    CONSTRAINT uq_user_qualities_catalog UNIQUE (user_id, catalog_quality_id), -- одно и то же качество нельзя принять дважды
    CONSTRAINT user_qualities_dev_priority_fk FOREIGN KEY (dev_priority_type, dev_priority_code) REFERENCES option_lists(list_type, code),
    CONSTRAINT user_qualities_focus_fk FOREIGN KEY (focus_type, focus_code) REFERENCES option_lists(list_type, code),
    CONSTRAINT user_qualities_dev_status_fk FOREIGN KEY (dev_status_type, dev_status_code) REFERENCES option_lists(list_type, code)
);
CREATE INDEX idx_user_qualities_user_id ON user_qualities(user_id);
CREATE INDEX idx_user_qualities_catalog ON user_qualities(catalog_quality_id);
CREATE INDEX idx_user_qualities_focus ON user_qualities(user_id, focus_code) WHERE focus_code = 'current_focus';

ALTER TABLE user_qualities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_qualities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_qualities
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

GRANT SELECT ON catalog_qualities, ideals, ideal_qualities TO app_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_qualities TO app_writer;

COMMIT;
