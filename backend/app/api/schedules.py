import random
import string
import uuid
from datetime import datetime, timezone, date, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import get_current_user
from ..core.config import settings
from ..models import User, Schedule, ScheduleParticipant
from ..schemas import (
    ScheduleOut, ScheduleParticipantOut, ScheduleCreate,
    ScheduleMetaUpdate, ScheduleJoinIn, AvailabilityIn,
)

router = APIRouter(prefix="/api/schedules", tags=["schedules"])

# 精确到小时时的 6 个固定 2 小时槽位
SLOTS = [
    "09:00-11:00", "11:00-13:00", "13:00-15:00",
    "15:00-17:00", "17:00-19:00", "19:00-21:00",
]
# 4 个可选等级（null = 未作答，第 5 态）
LEVELS = ("yes", "maybe", "maybe_not", "no")


def _gen_code(db: Session) -> str:
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if not db.query(Schedule).filter(Schedule.code == code).first():
            return code


def _iter_days(start: date, end: date) -> List[date]:
    """区间内每一天（含两端），按升序。"""
    n = (end - start).days
    if n < 0:
        return []
    return [start + timedelta(days=i) for i in range(n + 1)]


def _now():
    return datetime.now(timezone.utc)


def _bucket(yes: int, maybe: int, maybe_not: int, no: int) -> str:
    """合并热度 5 档（与前端 `utils/schedule.ts` 的 BUCKET_RULE 保持一致）。

    ① 无人作答 → white（不确定）
    ② 全员「一定有空」→ dark_green；全员「一定没空」→ dark_red
    ③ 只有「待确认」票（既无 yes 也无 no）→ white（不确定）
    ④ 其余按加权票数比较：正面票 = yes + maybe×0.5，负面票 = no + maybe_not×0.5
       正面多 → light_green；负面多 → light_red；打平 → white（分歧，需协商）

    注意 ④ 用「比较大小」而非「占比阈值」：旧版 `no >= 0.5*total → light_red`
    会把「2 人有空 1 人没空」这类明显偏正面的结果误判成「白色（不确定）」。
    """
    total = yes + maybe + maybe_not + no
    if total == 0:
        return "white"
    if yes == total:
        return "dark_green"
    if no == total:
        return "dark_red"
    if yes == 0 and no == 0:
        # 只有「可能有空 / 可能没空」，没有确定票 → 不确定
        return "white"
    pos = yes + maybe * 0.5
    neg = no + maybe_not * 0.5
    if pos > neg:
        return "light_green"
    if neg > pos:
        return "light_red"
    return "white"


def _sanitize_availability(av: Any, m: Schedule) -> Dict[str, Any]:
    """只保留区间内日期、合法等级；越界/非法一律丢弃。整体 upsert 前做一次归一化。"""
    if not isinstance(av, dict):
        return {}
    days = {d.isoformat() for d in _iter_days(m.start_date, m.end_date)}
    granular = m.granular_hours == "1"
    out: Dict[str, Any] = {}
    for ds, entry in av.items():
        if ds not in days or not isinstance(entry, dict):
            continue
        lv = entry.get("day")
        clean: Dict[str, Any] = {"day": lv if lv in LEVELS else None, "slots": None}
        if granular:
            slots: Dict[str, Any] = {}
            raw = entry.get("slots") or {}
            for s in SLOTS:
                slv = raw.get(s)
                slots[s] = slv if slv in LEVELS else None
            clean["slots"] = slots
        out[ds] = clean
    return out


def _serialize(
    m: Schedule,
    db: Session,
    request: Optional[Request],
    my_pid: Optional[str] = None,
    my_avail: Optional[Dict[str, Any]] = None,
    is_creator: Optional[bool] = None,
) -> ScheduleOut:
    parts = (
        db.query(ScheduleParticipant).filter(ScheduleParticipant.schedule_id == m.id).all()
    )
    participants = [
        ScheduleParticipantOut(
            id=p.id, nickname=p.nickname, avatar=p.avatar, wechat_id=p.wechat_id
        )
        for p in parts
    ]
    base = str(request.base_url)[:-1] if request else ""
    frontend_base = settings.FRONTEND_BASE or base
    share_url = (
        f"{frontend_base}/#/pages/schedule-detail/index?code={m.code}"
        if frontend_base
        else None
    )
    return ScheduleOut(
        id=m.id, code=m.code, title=m.title, description=m.description,
        start_date=m.start_date, end_date=m.end_date,
        granular_hours=m.granular_hours == "1", status=m.status,
        creator_id=m.creator_id,
        created_at=m.created_at, closed_at=m.closed_at, updated_at=m.updated_at,
        participant_count=len(parts), participants=participants,
        share_url=share_url,
        my_participant_id=my_pid,
        my_availability=my_avail,
        is_creator=is_creator,
    )


def _resolve_mine(m: Schedule, db: Session, user: Optional[User], pid: Optional[str]):
    """根据传入的 pid 或登录用户，确定「我」的参与者 id 与 availability。"""
    if pid:
        p = (
            db.query(ScheduleParticipant)
            .filter(ScheduleParticipant.id == pid, ScheduleParticipant.schedule_id == m.id)
            .first()
        )
        if p:
            return p.id, p.availability
    if user:
        p = (
            db.query(ScheduleParticipant)
            .filter(
                ScheduleParticipant.schedule_id == m.id,
                ScheduleParticipant.user_id == user.id,
            )
            .first()
        )
        if p:
            return p.id, p.availability
    return None, None


def _get(code: str, db: Session) -> Schedule:
    m = db.query(Schedule).filter(Schedule.code == code).first()
    if not m:
        raise HTTPException(404, "排期不存在")
    return m


# ── 创建 ──────────────────────────────────────────────────────────────────────
@router.post("", response_model=ScheduleOut)
def create_schedule(
    body: ScheduleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    if body.end_date < body.start_date:
        raise HTTPException(400, "结束日期不能早于开始日期")
    m = Schedule(
        id=str(uuid.uuid4()), code=_gen_code(db), creator_id=user.id,
        title=(body.title or "").strip() or "未命名排期",
        description=body.description,
        start_date=body.start_date, end_date=body.end_date,
        granular_hours="1" if body.granular_hours else "0",
        status="open",
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    creator_part = ScheduleParticipant(
        id=str(uuid.uuid4()), schedule_id=m.id, user_id=user.id,
        nickname=body.nickname or "我", avatar=body.avatar,
        wechat_id=body.wechat_id, availability={},
    )
    db.add(creator_part)
    db.commit()
    db.refresh(creator_part)
    return _serialize(m, db, request, my_pid=creator_part.id, my_avail={})


# ── 我发起/参与的列表（必须在 /{code} 之前，避免被 code 路由截获） ──────────────
@router.get("/mine", response_model=List[ScheduleOut])
def list_mine(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    created = db.query(Schedule).filter(Schedule.creator_id == user.id).all()
    joined_rows = (
        db.query(ScheduleParticipant).filter(ScheduleParticipant.user_id == user.id).all()
    )
    joined_ids = [r.schedule_id for r in joined_rows]
    joined = db.query(Schedule).filter(Schedule.id.in_(joined_ids)).all() if joined_ids else []
    seen = set()
    all_m: List[Schedule] = []
    for m in created + joined:
        if m.id in seen:
            continue
        seen.add(m.id)
        all_m.append(m)
    all_m.sort(key=lambda x: x.created_at, reverse=True)
    out: List[ScheduleOut] = []
    for m in all_m:
        pid, avail = _resolve_mine(m, db, user, None)
        out.append(_serialize(m, db, request, my_pid=pid, my_avail=avail, is_creator=(m.creator_id == user.id)))
    return out


# ── 详情 ──────────────────────────────────────────────────────────────────────
@router.get("/{code}", response_model=ScheduleOut)
def get_schedule(
    code: str,
    pid: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    m = _get(code, db)
    my_pid, my_avail = _resolve_mine(m, db, user, pid)
    return _serialize(m, db, request, my_pid=my_pid, my_avail=my_avail, is_creator=(m.creator_id == user.id))


# ── 修改元信息（标题/描述/时间段/精度，发起者专属） ───────────────────────────
@router.patch("/{code}", response_model=ScheduleOut)
def update_schedule(
    code: str,
    body: ScheduleMetaUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    m = _get(code, db)
    if m.creator_id != user.id:
        raise HTTPException(403, "只有发起者可以修改排期")
    if body.title is not None:
        m.title = (body.title or "").strip() or m.title
    if body.description is not None:
        m.description = body.description
    if body.start_date is not None:
        m.start_date = body.start_date
    if body.end_date is not None:
        m.end_date = body.end_date
    if body.start_date is not None and body.end_date is not None and m.end_date < m.start_date:
        raise HTTPException(400, "结束日期不能早于开始日期")
    if body.granular_hours is not None:
        m.granular_hours = "1" if body.granular_hours else "0"
    m.updated_at = _now()
    db.commit()
    return _serialize(m, db, request, *_resolve_mine(m, db, user, None))


# ── 加入 ──────────────────────────────────────────────────────────────────────
@router.post("/{code}/join", response_model=ScheduleOut)
def join_schedule(
    code: str,
    body: ScheduleJoinIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    m = _get(code, db)
    if m.status == "closed":
        raise HTTPException(400, "排期已锁定，不能加入")
    # 已加入（同微信 openid 或同设备用户）则直接返回，不重复加入
    existing = None
    if body.wechat_id:
        existing = (
            db.query(ScheduleParticipant)
            .filter(
                ScheduleParticipant.schedule_id == m.id,
                ScheduleParticipant.wechat_id == body.wechat_id,
            )
            .first()
        )
    if not existing and user:
        existing = (
            db.query(ScheduleParticipant)
            .filter(
                ScheduleParticipant.schedule_id == m.id,
                ScheduleParticipant.user_id == user.id,
            )
            .first()
        )
    if existing:
        return _serialize(m, db, request, my_pid=existing.id, my_avail=existing.availability)

    part = ScheduleParticipant(
        id=str(uuid.uuid4()), schedule_id=m.id, user_id=user.id,
        nickname=body.nickname or "朋友", avatar=body.avatar,
        wechat_id=body.wechat_id, availability={},
    )
    db.add(part)
    db.commit()
    db.refresh(part)
    return _serialize(m, db, request, my_pid=part.id, my_avail={})


# ── 保存本人作答（核心编辑接口，整体 upsert） ─────────────────────────────────
@router.put("/{code}/availability")
def save_availability(
    code: str,
    body: AvailabilityIn,
    db: Session = Depends(get_db),
):
    m = _get(code, db)
    if m.status == "closed":
        raise HTTPException(400, "排期已锁定，不能修改")
    p = (
        db.query(ScheduleParticipant)
        .filter(ScheduleParticipant.id == body.participant_id, ScheduleParticipant.schedule_id == m.id)
        .first()
    )
    if not p:
        raise HTTPException(404, "参与者不存在")
    p.availability = _sanitize_availability(body.availability, m)
    db.commit()
    return {"ok": True}


# ── 合并热度（只读） ──────────────────────────────────────────────────────────
@router.get("/{code}/merge")
def merge_schedule(code: str, db: Session = Depends(get_db)):
    m = _get(code, db)
    days = _iter_days(m.start_date, m.end_date)
    parts = (
        db.query(ScheduleParticipant).filter(ScheduleParticipant.schedule_id == m.id).all()
    )
    granular = m.granular_hours == "1"

    cells: Dict[str, Any] = {}
    breakdown: Dict[str, Any] = {}
    participants_meta: List[Dict[str, Any]] = []

    for p in parts:
        pending = 0
        av = p.availability or {}
        for ds in (d.isoformat() for d in days):
            entry = av.get(ds)
            if not isinstance(entry, dict):
                continue
            lv = entry.get("day")
            if lv in ("maybe", "maybe_not"):
                pending += 1
            if granular:
                for slv in (entry.get("slots") or {}).values():
                    if slv in ("maybe", "maybe_not"):
                        pending += 1
        participants_meta.append(
            {"id": p.id, "nickname": p.nickname, "avatar": p.avatar, "pending": pending}
        )

    for d in days:
        ds = d.isoformat()
        day_counts = {"yes": 0, "maybe": 0, "maybe_not": 0, "no": 0}
        day_bd: List[Dict[str, Any]] = []
        slot_counts = {s: {"yes": 0, "maybe": 0, "maybe_not": 0, "no": 0} for s in SLOTS} if granular else None
        slot_bd = {s: [] for s in SLOTS} if granular else None

        for p in parts:
            entry = (p.availability or {}).get(ds)
            if not isinstance(entry, dict):
                continue
            lv = entry.get("day")
            if lv in LEVELS:
                day_counts[lv] += 1
                day_bd.append({"pid": p.id, "nickname": p.nickname, "avatar": p.avatar, "level": lv})
            if granular:
                slots = entry.get("slots") or {}
                for s in SLOTS:
                    slv = slots.get(s)
                    if slv in LEVELS:
                        slot_counts[s][slv] += 1
                        slot_bd[s].append({"pid": p.id, "nickname": p.nickname, "avatar": p.avatar, "level": slv})

        cell: Dict[str, Any] = {
            "day": {**day_counts, "bucket": _bucket(**day_counts)}
        }
        if granular:
            cell["slots"] = {
                s: {**slot_counts[s], "bucket": _bucket(**slot_counts[s])} for s in SLOTS
            }
        cells[ds] = cell

        bd: Dict[str, Any] = {"day": day_bd}
        if granular:
            bd["slots"] = slot_bd
        breakdown[ds] = bd

    return {
        "granular_hours": granular,
        "days": [d.isoformat() for d in days],
        "slots": SLOTS if granular else [],
        "cells": cells,
        "breakdown": breakdown,
        "participants": participants_meta,
    }


# ── 发起者锁定 / 重新开启 ─────────────────────────────────────────────────────
@router.post("/{code}/close")
def close_schedule(
    code: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = _get(code, db)
    if m.creator_id != user.id:
        raise HTTPException(403, "只有发起者可以锁定排期")
    m.status = "closed"
    m.closed_at = _now()
    db.commit()
    return {"ok": True}


@router.post("/{code}/open")
def open_schedule(
    code: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = _get(code, db)
    if m.creator_id != user.id:
        raise HTTPException(403, "只有发起者可以重新开启排期")
    m.status = "open"
    m.closed_at = None
    db.commit()
    return {"ok": True}
