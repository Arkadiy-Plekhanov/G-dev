from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import actions, analytics, auth, catalog, cycles, goals, onboarding, qualities, reference, reflections

app = FastAPI(title="Личная система развития — API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/v1")
app.include_router(goals.router, prefix="/v1")
app.include_router(qualities.router, prefix="/v1")
app.include_router(actions.router, prefix="/v1")
app.include_router(catalog.router, prefix="/v1")
app.include_router(onboarding.router, prefix="/v1")
app.include_router(cycles.router, prefix="/v1")
app.include_router(reflections.router, prefix="/v1")
app.include_router(analytics.router, prefix="/v1")
app.include_router(reference.router, prefix="/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
