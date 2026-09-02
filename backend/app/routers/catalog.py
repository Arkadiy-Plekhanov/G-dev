from fastapi import APIRouter, Depends

from app.db import get_conn
from app.schemas import CatalogQualityOut, IdealOut
from app.deps import get_current_user_id
from app.errors import api_error

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/qualities", response_model=list[CatalogQualityOut])
def list_catalog_qualities(_user_id: str = Depends(get_current_user_id)):
    # Глобальный справочник, без RLS -- current_user_id здесь нужен только
    # чтобы эндпоинт оставался за авторизацией, не как фильтр видимости.
    with get_conn() as cur:
        cur.execute(
            "SELECT id, slug, name, definition, group_id FROM catalog_qualities "
            "WHERE is_active ORDER BY sort_order"
        )
        return cur.fetchall()


@router.get("/ideals", response_model=list[IdealOut])
def list_ideals(_user_id: str = Depends(get_current_user_id)):
    with get_conn() as cur:
        cur.execute(
            "SELECT id, slug, name, bio, category FROM ideals WHERE is_active ORDER BY sort_order"
        )
        ideals = cur.fetchall()
        for ideal in ideals:
            cur.execute(
                """SELECT iq.rank, cq.id, cq.slug, cq.name, cq.definition, cq.group_id
                   FROM ideal_qualities iq JOIN catalog_qualities cq ON cq.id = iq.catalog_quality_id
                   WHERE iq.ideal_id = %s ORDER BY iq.rank""",
                (ideal["id"],),
            )
            ideal["qualities"] = [
                {"rank": r["rank"], "quality": {"id": r["id"], "slug": r["slug"],
                                                 "name": r["name"], "definition": r["definition"],
                                                 "group_id": r["group_id"]}}
                for r in cur.fetchall()
            ]
        return ideals


@router.get("/ideals/{ideal_id}", response_model=IdealOut)
def get_ideal(ideal_id: str, _user_id: str = Depends(get_current_user_id)):
    with get_conn() as cur:
        cur.execute("SELECT id, slug, name, bio, category FROM ideals WHERE id = %s", (ideal_id,))
        ideal = cur.fetchone()
        if ideal is None:
            api_error(404, "IDEAL_NOT_FOUND", "Идеал не найден")
        cur.execute(
            """SELECT iq.rank, cq.id, cq.slug, cq.name, cq.definition, cq.group_id
               FROM ideal_qualities iq JOIN catalog_qualities cq ON cq.id = iq.catalog_quality_id
               WHERE iq.ideal_id = %s ORDER BY iq.rank""",
            (ideal_id,),
        )
        ideal["qualities"] = [
            {"rank": r["rank"], "quality": {"id": r["id"], "slug": r["slug"],
                                             "name": r["name"], "definition": r["definition"],
                                             "group_id": r["group_id"]}}
            for r in cur.fetchall()
        ]
        return ideal
