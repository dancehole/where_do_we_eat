import random
import string
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import get_current_user
from ..core.config import settings
from ..models import User, Meetup, Participant, Restaurant, Preference, Schedule
from ..schemas import (
    MeetupCreate, LocationIn, MeetupOut, ParticipantOut,
    RestaurantFilter, PreferenceIn, RestaurantOut, ParticipantUpdate,
    MeetupRuleIn,
)
from ..services import geo, amap, rank
from . import preferences as prefs_api

router = APIRouter(prefix="/api/meetups", tags=["meetups"])


def _dump(model) -> dict:
    """兼容 pydantic v1/v2。"""
    return model.model_dump() if hasattr(model, "model_dump") else model.dict()


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
            id=p.id, nickname=p.nickname, avatar=p.avatar, wechat_id=p.wechat_id,
            lat=float(p.lat), lng=float(p.lng),
            distance_km=d,
        ))
    base = str(request.base_url)[:-1] if request else ""
    # 分享链接走前端基础地址（不要拿后端 8000 端口，那只是 API）
    frontend_base = settings.FRONTEND_BASE or base
    share_url = f"{frontend_base}/#/pages/meetup-detail/index?code={m.code}" if frontend_base else None
    # 关联的排期：code 给前端跳转，title 用于展示
    sched = db.query(Schedule).filter(Schedule.id == m.schedule_id).first() if m.schedule_id else None
    return MeetupOut(
        id=m.id, code=m.code, status=m.status, meetup_type=m.meetup_type,
        rule=m.rule,
        center_lat=float(m.center_lat) if m.center_lat is not None else None,
        center_lng=float(m.center_lng) if m.center_lng is not None else None,
        created_at=m.created_at, participant_count=len(parts),
        participants=participants,
        share_url=share_url,
        schedule_code=sched.code if sched else None,
        schedule_title=sched.title if sched else None,
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
    # 可选：创建者勾选「启用排期」时，把已有排期 / 刚新建的排期关联进来
    if body.schedule_code:
        sch = db.query(Schedule).filter(Schedule.code == body.schedule_code).first()
        if not sch:
            raise HTTPException(400, "排期不存在")
        m.schedule_id = sch.id
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
                       nickname=loc.nickname or "朋友", avatar=loc.avatar,
                       wechat_id=loc.wechat_id, lat=loc.lat, lng=loc.lng)
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
    if body.avatar is not None:
        p.avatar = body.avatar
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


@router.patch("/{code}/rule")
def set_rule(code: str, body: MeetupRuleIn, db: Session = Depends(get_db)):
    """保存用户手动选择的碰面规则（算法后续补充，此处仅持久化选择）。"""
    m = db.query(Meetup).filter(Meetup.code == code).first()
    if not m:
        raise HTTPException(404, "碰面不存在")
    m.rule = body.rule
    db.commit()
    return _serialize(m, db, None)


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

    # 用户偏好：碰面专属 → 全局（设置页保存的是全局）
    prefs = prefs_api.prefs_of(db, user.id, m.id)

    # 单次请求的 filters 优先；缺省时用偏好里的默认值
    f = _dump(filters)
    # categories 收 CSV/竖线分隔字符串，这里拆成列表给排序算法用
    f["categories"] = [
        s.strip()
        for s in str(f.get("categories") or "").replace("|", ",").split(",")
        if s.strip()
    ]
    if f.get("price_min") is None:
        f["price_min"] = prefs.get("price_min")
    if f.get("price_max") is None:
        f["price_max"] = prefs.get("price_max")
    # 偏好里的 radius 可能来自 DB，统一转 int，避免把 Decimal 传给高德
    radius = int(f.get("radius") or prefs.get("radius") or 3000)
    f["radius"] = radius
    more = bool(f.get("more"))

    # 搜索中心：默认用「碰面中心」；若前端传了「地址附近」自定义坐标，则用它
    # （高德周边检索的 distance 字段也会相对该点计算，地图/距离展示才一致）。
    if f.get("near_lat") is not None and f.get("near_lng") is not None:
        search_lat, search_lng = float(f["near_lat"]), float(f["near_lng"])
    else:
        search_lat, search_lng = float(m.center_lat), float(m.center_lng)

    # 候选池：默认 1 页（≤25 条）；勾选「排序更多餐厅」则翻 4 页（≤100 条）
    raw = amap.search_restaurants(
        search_lat, search_lng,
        radius=radius, max_count=100 if more else 25, pages=4 if more else 1,
    )
    source = "amap"

    # 喜欢的菜系：高德不支持「喜欢/不喜欢」，用一次额外关键词检索把这些店捞进候选池
    liked = [c for c in (prefs.get("cuisine_include") or []) if c]
    if liked:
        extra = amap.search_restaurants(
            search_lat, search_lng,
            radius=radius, keywords="|".join(liked), types="餐饮服务",
            max_count=25, pages=1,
        )
        seen = {f"{r['name']}|{r.get('lat')}|{r.get('lng')}" for r in raw}
        for r in extra:
            k = f"{r['name']}|{r.get('lat')}|{r.get('lng')}"
            if k not in seen:
                seen.add(k)
                raw.append(r)

    if not raw:
        raw = _mock_restaurants(float(m.center_lat), float(m.center_lng))
        source = "mock"

    # 「排序更多餐厅」：从大候选池里取评分最好的前 25 家参与排序
    if more:
        rated = [r for r in raw if r.get("rating") is not None]
        unrated = [r for r in raw if r.get("rating") is None]
        rated.sort(key=lambda x: x["rating"], reverse=True)
        raw = (rated + unrated)[:25]

    scored = rank.score_restaurants(raw, f, prefs)

    # 「想去的品牌/餐厅」：无视距离，用大半径关键词检索该品牌，强制纳入推荐列表。
    # 范围内的多个分店全部列出；理由统一为「你想吃 X」。
    forced: List[Dict] = []
    want = (f.get("want") or "").strip()
    if want:
        want_matches = amap.search_restaurants(
            search_lat, search_lng,
            radius=50000, keywords=want, types="餐饮服务",
            max_count=10, pages=1,
        )
        seen_want = set()
        for wm in want_matches:
            wk = f"{wm.get('name')}|{wm.get('lat')}|{wm.get('lng')}"
            if wk in seen_want:
                continue
            seen_want.add(wk)
            fm = dict(wm)
            fm["reason"] = f"你想吃 {want}"
            fm["forced"] = True
            forced.append(fm)

    # 合并 forced：命中已有候选的覆盖 reason；超出半径（不在 scored 内）的补到列表最前，保证一定展示。
    scored_keys = {f"{r.get('name')}|{r.get('lat')}|{r.get('lng')}" for r in scored}
    final: List[Dict] = []
    for r in scored:
        rk = f"{r.get('name')}|{r.get('lat')}|{r.get('lng')}"
        hit = next((fr for fr in forced if f"{fr.get('name')}|{fr.get('lat')}|{fr.get('lng')}" == rk), None)
        if hit:
            rr = dict(r)
            rr["reason"] = hit["reason"]
            rr["forced"] = True
            final.append(rr)
        else:
            final.append(r)
    for fr in forced:
        fk = f"{fr.get('name')}|{fr.get('lat')}|{fr.get('lng')}"
        if fk not in scored_keys:
            fr2 = dict(fr)
            fr2["score"] = fr2.get("score") if fr2.get("score") is not None else 60.0
            final.insert(0, fr2)

    # 缓存到 restaurants 表
    db.query(Restaurant).filter(Restaurant.meetup_id == m.id).delete()
    for r in final:
        db.add(Restaurant(
            id=str(uuid.uuid4()), meetup_id=m.id, source=source,
            name=r["name"], lat=r.get("lat"), lng=r.get("lng"),
            address=r.get("address"), category=r.get("category"),
            avg_price=r.get("avg_price"), rating=r.get("rating"),
            business_status=r.get("business_status"),
            score=r.get("score"), reason=r.get("reason"),
        ))
    db.commit()
    for r in final:
        r["source"] = source
    # 默认返回 20 家；勾选「排序更多餐厅」时返回 25 家
    return final[: 25 if more else 20]


@router.post("/{code}/preferences")
def set_preference(code: str, body: PreferenceIn,
                   user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    """设置「本次碰面专属」的偏好。

    注意：以前这里错把 meetup 的 **code** 存进了 meetup_id 字段，导致读取时按 id 查询永远匹配不上、
    偏好完全不生效（已修复为存 m.id）。跨碰面的通用偏好请用 `PUT /api/preferences`。
    """
    m = db.query(Meetup).filter(Meetup.code == code).first()
    if not m:
        raise HTTPException(404, "碰面不存在")
    row = db.query(Preference).filter(
        Preference.user_id == user.id, Preference.meetup_id == m.id
    ).first()
    if row is None:
        row = Preference(id=str(uuid.uuid4()), user_id=user.id, meetup_id=m.id)
        db.add(row)
    prefs_api.apply_prefs(row, body)
    db.commit()
    return {"ok": True}
