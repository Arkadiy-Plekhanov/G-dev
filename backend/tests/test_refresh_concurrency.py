"""
Проверка утверждения из внешней критики: при N одновременных /auth/refresh
с ОДНИМ и тем же токеном ротация может пройти больше одного раза, если
SELECT перед UPDATE не берёт блокировку строки.

Сначала прогоняется на ТЕКУЩЕМ коде (ожидание: воспроизвести гонку), затем,
после фикса (SELECT ... FOR UPDATE), прогоняется снова (ожидание: ровно
один успех из N).
"""
import threading
import uuid

import psycopg2
import pytest
from fastapi.testclient import TestClient

from app.deps import get_google_verifier
from app.main import app

DSN = "host=127.0.0.1 dbname=selfdev user=app_writer password=change_me_in_production"
N_CONCURRENT = 20


@pytest.fixture(autouse=True)
def cleanup():
    yield
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    conn.cursor().execute("DELETE FROM users WHERE email LIKE '%@example.com'")
    conn.close()


def test_concurrent_refresh_exactly_one_winner():
    def fake_verify(id_token):
        return {"iss": "https://accounts.google.com", "sub": f"race-{uuid.uuid4()}",
                "email": f"race-{uuid.uuid4()}@example.com", "name": "Race Test",
                "picture": None, "locale": "en"}
    app.dependency_overrides[get_google_verifier] = lambda: fake_verify
    client = TestClient(app)
    try:
        login = client.post("/v1/auth/google", json={"id_token": "x"}).json()
        token = login["refresh_token"]

        results = [None] * N_CONCURRENT

        def worker(i):
            r = client.post("/v1/auth/refresh", json={"refresh_token": token})
            results[i] = r.status_code

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(N_CONCURRENT)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        successes = results.count(200)
        print(f"\n{N_CONCURRENT} одновременных refresh одним токеном -> {successes} успешных (ожидание: 1)")
        assert successes == 1, f"race condition: {successes} из {N_CONCURRENT} прошли успешно, ожидался ровно 1"
    finally:
        app.dependency_overrides.clear()
