from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import get_current_user
from ..models import Meetup, Restaurant, User
from ..schemas import AIRecommendIn
from ..services import llm
from . import preferences as prefs_api

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/recommend")
def ai_recommend(
    body: AIRecommendIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """生成 AI 推荐。

    推荐用法：前端只传 `code` + 当前已排序的 `restaurants`，
    后端据此拼装真实上下文：
      - `prefers`：由该用户的偏好（菜系/品牌/商圈/预算/半径/手写备注）拼成中文描述
      - `budget`：取偏好里的价格上限
      - `center_name`：取候选里出现最多的**商圈名**（比写死「市中心」有意义）
    """
    center_name = body.center_name
    budget = body.budget
    prefers = body.prefers
    restaurants = body.restaurants

    if body.code:
        m = db.query(Meetup).filter(Meetup.code == body.code).first()
        if not m:
            raise HTTPException(404, "碰面不存在")

        prefs = prefs_api.prefs_of(db, user.id, m.id)
        if not prefers:
            prefers = llm.prefs_to_text(prefs)
        if budget is None:
            budget = prefs.get("price_max")

        # 没传候选就从缓存表读（少了商圈/图片，但至少能生成）
        if not restaurants:
            rows = (
                db.query(Restaurant)
                .filter(Restaurant.meetup_id == m.id)
                .order_by(Restaurant.score.desc())
                .limit(30)
                .all()
            )
            restaurants = [
                {
                    "name": r.name,
                    "avg_price": float(r.avg_price) if r.avg_price is not None else None,
                    "rating": float(r.rating) if r.rating is not None else None,
                    "category": r.category,
                    "address": r.address,
                }
                for r in rows
            ]

        if not center_name:
            areas = [str((r or {}).get("business_area") or "").strip() for r in (restaurants or [])]
            areas = [a for a in areas if a]
            if areas:
                center_name = Counter(areas).most_common(1)[0][0]
            elif m.center_lat is not None:
                center_name = f"{float(m.center_lat):.4f},{float(m.center_lng):.4f} 附近"
            else:
                center_name = "碰面中心点"

    center_name = center_name or "市中心"
    prefers = prefers or "无特别偏好"

    text = llm.ai_recommend(
        center_name=center_name,
        budget=budget or 0,
        prefers=prefers,
        restaurants=restaurants or [],
    )
    return {
        "text": text,
        "context": {
            "center_name": center_name,
            "budget": budget,
            "prefers": prefers,
            "count": len(restaurants or []),
        },
    }
