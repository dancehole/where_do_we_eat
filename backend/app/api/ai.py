from fastapi import APIRouter
from ..schemas import AIRecommendIn
from ..services import llm

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/recommend")
def ai_recommend(body: AIRecommendIn):
    text = llm.ai_recommend(
        center_name=body.center_name,
        budget=body.budget,
        prefers=body.prefers,
        restaurants=body.restaurants,
    )
    return {"text": text}
