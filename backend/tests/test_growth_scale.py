"""Именованная шкала роста и отделение обратного проявления (миграция 10).

Главный инвариант, который здесь защищается: оценка 0 ("пошло иначе") НЕ
участвует в средних по шкале роста. Если это когда-нибудь сломается, среднее
начнёт молча смешивать два разных вопроса -- "насколько развито качество" и
"как часто я срываюсь" -- и обе цифры перестанут что-либо значить. Ошибка
была бы незаметной: числа продолжали бы считаться, просто стали бы врать.
"""
import os
import uuid

import psycopg2
import pytest
from fastapi.testclient import TestClient

from app.deps import get_google_verifier
from app.main import app

DSN = f"host={os.environ.get('TEST_DB_HOST', '127.0.0.1')} dbname=selfdev user=app_writer password=change_me_in_production"


@pytest.fixture
def scale_client():
    def fake_verify(id_token):
        return {"iss": "https://accounts.google.com", "sub": f"scale-{uuid.uuid4()}",
                "email": f"scale-{uuid.uuid4()}@example.com", "name": "Scale Test",
                "picture": None, "locale": "en"}
    app.dependency_overrides[get_google_verifier] = lambda: fake_verify
    client = TestClient(app)
    login = client.post("/v1/auth/google", json={"id_token": "x"}).json()
    h = {"Authorization": f"Bearer {login['access_token']}"}

    catalog = client.get("/v1/catalog/qualities", headers=h).json()
    quality = client.post("/v1/qualities", json={"catalog_quality_id": catalog[0]["id"],
                                                  "focus_code": "current_focus"}, headers=h).json()
    yield client, h, quality
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def cleanup():
    yield
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    conn.cursor().execute("DELETE FROM users WHERE email LIKE '%@example.com'")
    conn.close()


def _log(client, h, quality_id, name, date, score):
    return client.post("/v1/actions/with-qualities", json={
        "name": name, "occurred_at": date,
        "qualities": [{"quality_id": quality_id, "score": score}],
    }, headers=h)


# ---------- главный инвариант ----------

def test_inversion_is_excluded_from_the_growth_average(scale_client):
    """Ступени 4 и 2 плюс один срыв. Среднее обязано быть 3.0 = (4+2)/2,
    а не 2.0 = (4+2+0)/3."""
    client, h, q = scale_client
    _log(client, h, q["id"], "act A", "2026-08-20", 4)
    _log(client, h, q["id"], "act B", "2026-08-21", 2)
    _log(client, h, q["id"], "act C", "2026-08-25", 0)

    mine = client.get("/v1/qualities", headers=h).json()[0]
    assert float(mine["avg_score_all_time"]) == 3.0
    assert mine["expression_count"] == 2   # только ступени роста
    assert mine["inversion_count"] == 1    # срыв посчитан, но отдельно


def test_inversion_alone_yields_no_growth_average_but_is_still_recorded(scale_client):
    """Единственная запись -- срыв. Среднего по росту нет вообще (а не 0.0:
    0.0 читалось бы как "качество развито на ноль", что неправда -- данных
    о развитии просто нет). Но сам факт зафиксирован."""
    client, h, q = scale_client
    _log(client, h, q["id"], "only inversion", "2026-08-22", 0)

    mine = client.get("/v1/qualities", headers=h).json()[0]
    assert mine["avg_score_all_time"] is None
    assert mine["expression_count"] == 0
    assert mine["inversion_count"] == 1


def test_inversion_still_counts_as_having_noticed_the_quality(scale_client):
    """Сорвался -- значит всё-таки заметил, что качество было уместно.
    Поэтому "последний раз замечено" учитывает срывы, в отличие от средних."""
    client, h, q = scale_client
    _log(client, h, q["id"], "growth", "2026-08-10", 3)
    _log(client, h, q["id"], "inversion later", "2026-08-28", 0)

    r = client.get(f"/v1/qualities/{q['id']}/overview", headers=h).json()
    assert str(r["quality"]["last_expressed_at"]) == "2026-08-28"


# ---------- машиночитаемость (условие локализации на 7 языков) ----------

def test_stats_return_machine_readable_codes_not_display_strings(scale_client):
    """До миграции 10 вьюха отдавала русские строки ('↑ Растёт', 'Высокая')
    прямо в англоязычный интерфейс. Перевод обязан жить во фронтенде."""
    client, h, q = scale_client
    for i, score in enumerate([3, 3, 3, 4]):
        _log(client, h, q["id"], f"act {i}", f"2026-08-{10+i:02d}", score)

    mine = client.get("/v1/qualities", headers=h).json()[0]
    assert mine["stability"] in {"insufficient_data", "high", "medium", "low"}
    assert mine["confidence"] in {"no_data", "very_limited", "limited", "sufficient", "robust"}
    assert mine["trend"] in {"insufficient_data", "rising", "declining", "steady"}


# ---------- сама шкала как словарь продукта ----------

def test_score_legend_exposes_named_stages_with_translations(scale_client):
    client, h, _ = scale_client
    legend = client.get("/v1/reference/score-legend", headers=h).json()

    assert len(legend) == 5
    by_slug = {row["slug"]: row for row in legend}
    assert set(by_slug) == {"inverted", "spark", "kindling", "flame", "gem"}

    # Огонь, кристаллизующийся в камень: 1..4 -- ступени роста.
    assert [r["score"] for r in legend if r["is_growth_stage"]] == [1, 2, 3, 4]

    # Ровно одна запись вне шкалы роста -- обратное проявление.
    off_scale = [r for r in legend if not r["is_growth_stage"]]
    assert len(off_scale) == 1 and off_scale[0]["score"] == 0

    # Локализация на месте с самого начала, не прикручивается потом.
    for row in legend:
        assert row["name"]["en"] and row["name"]["ru"]
        assert row["description"]["en"] and row["description"]["ru"]


def test_full_scale_is_still_accepted_by_the_api(scale_client):
    """Диапазон 0..4 сохранён -- миграция сменила смысл, не форму."""
    client, h, q = scale_client
    for score in (0, 1, 2, 3, 4):
        r = _log(client, h, q["id"], f"score {score}", "2026-08-15", score)
        assert r.status_code == 201, f"score={score} отвергнут"

    r = _log(client, h, q["id"], "out of range", "2026-08-15", 5)
    assert r.status_code == 422
