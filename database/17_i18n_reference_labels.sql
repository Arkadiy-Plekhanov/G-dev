-- ============================================================
-- 17. i18n справочников: label text -> label jsonb {en, ru}
-- ============================================================
-- option_lists.label и action_contexts.label хранили обычный текст на
-- ОДНОМ языке (русском), и он приезжал в англоязычный интерфейс как есть:
-- в поле «Context» на экране «Log an action» стояло «Публичное
-- выступление», в статусах целей -- «Активна». Видно на скриншотах с
-- реального устройства.
--
-- Это прямо противоречило ADR v2 §6: «отображаемые тексты каталогов --
-- JSONB {locale: text}». Каталог качеств и идеалы так и сделаны
-- (catalog_qualities.name, .definition), а справочники остались с
-- прошлого этапа.
--
-- Коды (code, list_type) НЕ трогаем -- по тому же ADR они англоязычные,
-- стабильные и никогда не локализуются: на них ссылается вся логика и
-- внешние ключи.
--
-- Русский текст сохраняется в ключ "ru", а не выбрасывается: он
-- первоисточник и понадобится при русской локализации интерфейса.
-- ============================================================

BEGIN;

ALTER TABLE option_lists     ADD COLUMN label_i18n jsonb;
ALTER TABLE action_contexts  ADD COLUMN label_i18n jsonb;
-- quality_groups тоже: его подписи («Мудрость», «Любовь и сострадание»)
-- задавались сидом каталога и остались русскими. Интерфейс их пока не
-- показывает, но оставлять третий справочник в другом формате -- значит
-- гарантированно забыть о нём, когда группировка появится на экране.
ALTER TABLE quality_groups   ADD COLUMN label_i18n jsonb;

-- Перенос: русский -> ключ "ru", английский добавляется явно ниже.
UPDATE option_lists    SET label_i18n = jsonb_build_object('ru', label);
UPDATE action_contexts SET label_i18n = jsonb_build_object('ru', label);
UPDATE quality_groups  SET label_i18n = jsonb_build_object('ru', label);

-- Английские подписи. Пишутся по (list_type, code) / code, а не по
-- русскому тексту: код -- стабильный идентификатор, текст может меняться.
UPDATE option_lists SET label_i18n = label_i18n || jsonb_build_object('en', v.en)
FROM (VALUES
    ('action_status','planned','Planned'),
    ('action_status','done','Done'),
    ('action_status','cancelled','Cancelled'),
    ('cycle_status','planned','Planned'),
    ('cycle_status','active','Active'),
    ('cycle_status','done','Finished'),
    ('goal_status','idea','Idea'),
    ('goal_status','active','Active'),
    ('goal_status','paused','Paused'),
    ('goal_status','achieved','Achieved'),
    ('goal_status','cancelled','Cancelled'),
    ('priority','p1_critical','P1 — Critical'),
    ('priority','p2_high','P2 — High'),
    ('priority','p3_normal','P3 — Normal'),
    ('priority','background','Background'),
    ('quality_dev_status','undeveloped','Undeveloped'),
    ('quality_dev_status','forming','Forming'),
    ('quality_dev_status','stable','Stable'),
    ('quality_dev_status','anchored','Anchored'),
    ('quality_focus','current_focus','Current focus'),
    ('quality_focus','maintenance','Maintaining'),
    ('quality_focus','background','Background'),
    ('quality_focus','not_in_focus','Not in focus'),
    ('reflection_type','daily','Daily'),
    ('reflection_type','weekly','Weekly'),
    ('reflection_type','monthly','Monthly'),
    ('reflection_type','cycle','Season'),
    ('reflection_type','goal','Goal')
) AS v(list_type, code, en)
WHERE option_lists.list_type = v.list_type AND option_lists.code = v.code;

UPDATE action_contexts SET label_i18n = label_i18n || jsonb_build_object('en', v.en)
FROM (VALUES
    ('negotiation','Negotiation'),
    ('conflict','Conflict'),
    ('work','Work'),
    ('public_speaking','Public speaking'),
    ('learning','Learning'),
    ('relationships','Relationships'),
    ('solo_work','Solo work'),
    ('community','Community'),
    ('health_daily','Health & daily life'),
    ('other','Other')
) AS v(code, en)
WHERE action_contexts.code = v.code;

UPDATE quality_groups SET label_i18n = label_i18n || jsonb_build_object('en', v.en)
FROM (VALUES
    ('wisdom','Wisdom'),
    ('self_mastery','Self-mastery'),
    ('love','Love & compassion'),
    ('culture','Joy & culture'),
    ('affability','Affability'),
    ('purity','Purity & discipline'),
    ('diligence','Diligence'),
    ('activity','Action & courage'),
    ('constancy','Loyalty & constancy')
) AS v(code, en)
WHERE quality_groups.code = v.code;

-- Ни одной записи без английской подписи остаться не должно: иначе
-- интерфейс молча покажет пустоту там, где ожидается название.
DO $$
DECLARE missing int;
BEGIN
    SELECT count(*) INTO missing FROM option_lists WHERE label_i18n->>'en' IS NULL;
    IF missing > 0 THEN
        RAISE EXCEPTION 'option_lists: % записей без английской подписи', missing;
    END IF;
    SELECT count(*) INTO missing FROM action_contexts WHERE label_i18n->>'en' IS NULL;
    IF missing > 0 THEN
        RAISE EXCEPTION 'action_contexts: % записей без английской подписи', missing;
    END IF;
    SELECT count(*) INTO missing FROM quality_groups WHERE label_i18n->>'en' IS NULL;
    IF missing > 0 THEN
        RAISE EXCEPTION 'quality_groups: % записей без английской подписи', missing;
    END IF;
END $$;

ALTER TABLE option_lists     ALTER COLUMN label_i18n SET NOT NULL;
ALTER TABLE action_contexts  ALTER COLUMN label_i18n SET NOT NULL;
ALTER TABLE quality_groups   ALTER COLUMN label_i18n SET NOT NULL;

-- Старая колонка удаляется: два источника подписи разошлись бы при первой
-- же правке, и неизвестно было бы, какой из них показывает интерфейс.
ALTER TABLE option_lists     DROP COLUMN label;
ALTER TABLE action_contexts  DROP COLUMN label;
ALTER TABLE quality_groups   DROP COLUMN label;

ALTER TABLE option_lists     RENAME COLUMN label_i18n TO label;
ALTER TABLE action_contexts  RENAME COLUMN label_i18n TO label;
ALTER TABLE quality_groups   RENAME COLUMN label_i18n TO label;

COMMIT;
