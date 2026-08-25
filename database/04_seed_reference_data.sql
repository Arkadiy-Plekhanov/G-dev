INSERT INTO option_lists (list_type, code, label, sort_order) VALUES
('goal_status', 'idea',      'Идея',            10),
('goal_status', 'active',    'Активна',         20),
('goal_status', 'paused',    'Приостановлена',  30),
('goal_status', 'achieved',  'Достигнута',      40),
('goal_status', 'cancelled', 'Отменена',        50),

('priority', 'p1_critical', 'P1 — Критический', 10),
('priority', 'p2_high',     'P2 — Высокий',      20),
('priority', 'p3_normal',   'P3 — Обычный',      30),
('priority', 'background',  'Фоновый',           40),

('action_status', 'planned',   'Запланировано', 10),
('action_status', 'done',      'Завершено',      20),
('action_status', 'cancelled', 'Отменено',       30),

('quality_dev_status', 'undeveloped', 'Не развито',  10),
('quality_dev_status', 'forming',     'Формируется', 20),
('quality_dev_status', 'stable',      'Устойчиво',   30),
('quality_dev_status', 'anchored',    'Закреплено',  40),

('quality_focus', 'current_focus', 'Текущий фокус', 10),
('quality_focus', 'maintenance',   'Поддержание',   20),
('quality_focus', 'background',    'Фоновое',       30),
('quality_focus', 'not_in_focus',  'Не в фокусе',   40),

('reflection_type', 'daily',   'Ежедневная',   10),
('reflection_type', 'weekly',  'Еженедельная', 20),
('reflection_type', 'monthly', 'Ежемесячная',  30),
('reflection_type', 'cycle',   'По циклу',     40),

('cycle_status', 'planned', 'Планируется', 10),
('cycle_status', 'active',  'Активен',     20),
('cycle_status', 'done',    'Завершён',    30);

INSERT INTO quality_groups (code, label, sort_order) VALUES
('intellect',      'Интеллект',       10),
('will',           'Воля',            20),
('self_control',   'Самообладание',   30),
('morality',       'Нравственность',  40),
('relationships',  'Отношения',       50),
('leadership',     'Лидерство',       60),
('responsibility', 'Ответственность', 70),
('learning',       'Обучение',        80),
('awareness',      'Сознательность',  90);

INSERT INTO action_contexts (code, label, sort_order) VALUES
('negotiation',     'Переговоры',             10),
('conflict',        'Конфликт',               20),
('work',            'Работа',                 30),
('public_speaking', 'Публичное выступление',  40),
('learning',        'Обучение',               50),
('relationships',   'Отношения',              60),
('solo_work',       'Самостоятельная работа', 70),
('community',       'Общественная среда',     80),
('health_daily',    'Здоровье/быт',           90),
('other',           'Другое',                100);

INSERT INTO score_legend (score, meaning) VALUES
(0, 'Качество было релевантно, но проявлено противоположным образом / серьёзный провал'),
(1, 'Слабое проявление'),
(2, 'Частичное / сознательное проявление'),
(3, 'Хорошее устойчивое проявление'),
(4, 'Очень сильное, практически естественное проявление');
