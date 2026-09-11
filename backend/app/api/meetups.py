import random
import string
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import get_current_user
from ..core.config import settings
from ..models import User, Meetup, Participant, Restaurant, Preference
from ..schemas import (
    MeetupCreate, LocationIn, MeetupOut, ParticipantOut,
    RestaurantFilter, PreferenceIn, RestaurantOut, ParticipantUpdate,
)
from ..services import geo, amap, rank

router = APIRouter(prefix="/api/meetups", tags=["meetups"])


def _gen_code(db: Session) -> str:
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if not db.query(Meetup).filter(Meetup.code == code).first():
            return code


def _mock_restaurants(lat: float, lng: float) -> list:
    names = ["老地方川菜", "海底捞火锅", "西贝莜面村", "外婆家", "必胜客",
             "麦当劳", "星巴克", "绿茶餐厅", "南京大牌档", "费大厨辣椒炒肉"]
    cats = ["川菜", "火锅", "西北菜", "杭帮菜", "西餐", "快餐", "咖啡", "杭帮菜", "淮扬菜", "湘菜"]
    out = []
    for i, n in enumerate(names):
        out.append({
            "name": n,
            "lat": lat + (i - 5) * 0.002,
            "lng": lng + (i - 5) * 0.002,
            "address": f"示例商圈 {i+1} 号",
            "category": cats[i],
            "avg_price": 40 + i * 15,
            "rating": round(4.0 + (i % 5) * 0.1, 1),
            "business_status": "营业",
            "near_subway": i % 2 == 0,
            "business_district": i % 3 == 0,
        })
    return out


def _serialize(m: Meetup, db: Session, request: Optional[Request]):
    parts = db.query(Participant).filter(Participant.meetup_id == m.id).all()
    creator = parts[0] if parts else None
    participants = []
    for p in parts:
        d = None
        if creator and p is not creator:
            d = round(geo.haversine(float(creator.lat), float(creator.lng),
                                    float(p.lat), float(p.lng)), 1)
        participants.append(ParticipantOut(
            id=p.id, nickname=p.nickname, lat=float(p.lat), lng=float(p.lng),
            distance_km=d,
        ))
    base = str(request.base_url)[:-1] if request else ""
    # 分享链接走前端基础地址（不要拿后端 8000 端口，那只是 API）
    frontend_base = settings.FRONTEND_BASE or base
    share_url = f"{frontend_base}/#/pages/meetup-detail/index?code={m.code}" if frontend_base else None
    return MeetupOut(
        id=m.id, code=m.code, status=m.status, meetup_type=m.meetup_type,
        center_lat=float(m.center_lat) if m.center_lat is not None else None,
        center_lng=float(m.center_lng) if m.center_lng is not None else None,
        created_at=m.created_at, participant_count=len(parts),
        participants=participants,
        share_url=share_url,
    )


def _ensure_center(m: Meetup, db: Session):
    parts = db.query(Participant).filter(Participant.meetup_id == m.id).all()
    pts = [(float(p.lat), float(p.lng)) for p in parts]
    if not pts:
        raise HTTPException(400, "还没有人参加，无法计算中心")
    if geo.is_same_city(pts):
        c = geo.centroid(pts)
        m.meetup_type = "same_city"
    else:
        c = geo.equal_cost_center(pts)
        m.meetup_type = "travel"
    m.center_lat, m.center_lng = c
    db.commit()


@router.post("", response_model=MeetupOut)
def create_meetup(
    body: MeetupCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    m = Meetup(id=str(uuid.uuid4()), code=_gen_code(db),
               creator_id=user.id, status="active")
    db.add(m)
    db.commit()
    db.refresh(m)
    creator_part = None
    if body.lat is not None and body.lng is not None:
        creator_part = Participant(id=str(uuid.uuid4()), meetup_id=m.id, user_id=user.id,
                                    nickname=body.nickname or "我", lat=body.lat, lng=body.lng)
        db.add(creator_part)
        db.commit()
    out = _serialize(m, db, request)
    if creator_part:
        out.my_participant_id = creator_part.id
    return out


@router.get("/{code}", response_model=MeetupOut)
def get_meetup(code: str, db: Session = Depends(get_db), request: Request = None):
    m = db.query(Meetup).filter(Meetup.code == code).first()
    if not m:
        raise HTTPException(404, "碰面不存在")
    return _serialize(m, db, request)


@router.post("/{code}/join", response_model=MeetupOut)
def join_meetup(code: str, loc: LocationIn, db: Session = Depends(get_db), request: Request = None):
    m = db.query(Meetup).filter(Meetup.code == code).first()
    if not m:
        raise HTTPException(404, "碰面不存在")
    if m.status == "ended":
        raise HTTPException(400, "碰面已结束，不能加入")
    part = Participant(id=str(uuid.uuid4()), meetup_id=m.id, user_id=None,
                       nickname=loc.nickname or "朋友", lat=loc.lat, lng=loc.lng)
    db.add(part)
    db.commit()
    db.refresh(part)
    out = _serialize(m, db, request)
    out.my_participant_id = part.id
    return out


@router.post("/{code}/add-location", response_model=MeetupOut)
def add_location(code: str, loc: LocationIn, db: Session = Depends(get_db), request: Request = None):
    return join_meetup(code, loc, db, request)


@router.patch("/{code}/participants/{pid}", response_model=MeetupOut)
def update_participant(
    code: str,
    pid: str,
    body: ParticipantUpdate,
    db: Session = Depends(get_db),
    request: Request = None,
):
    """更新某个参与者的位置/昵称（本人刷新位置时调用，避免重复加入）。"""
    m = db.query(Meetup).filter(Meetup.code == code).first()
    if not m:
        raise HTTPException(404, "碰面不存在")
    p = (
        db.query(Participant)
        .filter(Participant.id == pid, Participant.meetup_id == m.id)
        .first()
    )
    if not p:
        raise HTTPException(404, "参与者不存在")
    if body.lat is not None:
        p.lat = body.lat
    if body.lng is not None:
        p.lng = body.lng
    if body.nickname:
        p.nickname = body.nickname
    db.commit()
    out = _serialize(m, db, request)
    out.my_participant_id = p.id
    return out


@router.post("/{code}/end")
def end_meetup(code: str, db: Session = Depends(get_db)):
    m = db.query(Meetup).filter(Meetup.code == code).first()
    if not m:
        raise HTTPException(404, "碰面不存在")
    m.status = "ended"
    m.ended_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.get("")
def list_my(status: Optional[str] = None,
            user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    q = db.query(Meetup).filter(Meetup.creator_id == user.id)
    if status:
        q = q.filter(Meetup.status == status)
    return [_serialize(m, db, None) for m in q.order_by(Meetup.created_at.desc()).all()]


@router.get("/history/list")
def history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_my("ended", user, db)


@router.get("/{code}/center")
def compute_center(code: str, db: Session = Depends(get_db)):
    m = db.query(Meetup).filter(Meetup.code == code).first()
    if not m:
        raise HTTPException(404, "碰面不存在")
    _ensure_center(m, db)
    return {
        "center_lat": float(m.center_lat),
        "center_lng": float(m.center_lng),
        "meetup_type": m.meetup_type,
    }


@router.get("/{code}/restaurants", response_model=list)
def get_restaurants(
    code: str,
    filters: RestaurantFilter = Depends(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(Meetup).filter(Meetup.code == code).first()
    if not m:
        raise HTTPException(404, "碰面不存在")
    if m.center_lat is None:
        _ensure_center(m, db)

    raw = amap.search_restaurants(float(m.center_lat), float(m.center_lng))
    source = "amap"
    if not raw:
        raw = _mock_restaurants(float(m.center_lat), float(m.center_lng))
        source = "mock"

    pref = db.query(Preference).filter(
        Preference.user_id == user.id, Preference.meetup_id == m.id
    ).order_by(Preference.id.desc()).first()
    pref_dict = {
        "brand_include": (pref.brand_include if pref else None) or [],
        "brand_exclude": (pref.brand_exclude if pref else None) or [],
        "restaurant_include": (pref.restaurant_include if pref else None) or [],
        "restaurant_exclude": (pref.restaurant_exclude if pref else None) or [],
    }
    scored = rank.score_restaurants(raw, filters.dict(), pref_dict)

    # 缓存到 restaurants 表
    db.query(Restaurant).filter(Restaurant.meetup_id == m.id).delete()
    for r in scored:
        db.add(Restaurant(
            id=str(uuid.uuid4()), meetup_id=m.id, source=source,
            name=r["name"], lat=r.get("lat"), lng=r.get("lng"),
            address=r.get("address"), category=r.get("category"),
            avg_price=r.get("avg_price"), rating=r.get("rating"),
            business_status=r.get("business_status"),
            score=r.get("score"), reason=r.get("reason"),
        ))
    db.commit()
    for r in scored:
        r["source"] = source
    return scored[:20]


@router.post("/{code}/preferences")
def set_preference(code: str, body: PreferenceIn,
                   user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    db.add(Preference(
        user_id=user.id, meetup_id=code,
        brand_include=body.brand_include, brand_exclude=body.brand_exclude,
        restaurant_include=body.restaurant_include,
        restaurant_exclude=body.restaurant_exclude,
    ))
    db.commit()
    return {"ok": True}
