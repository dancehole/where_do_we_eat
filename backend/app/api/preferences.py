"""用户偏好：读取 / 保存 / 用 AI 把长文本解析成结构化偏好。

偏好分两种：
- **全局**（meetup_id = NULL）：设置页保存的就是这条，跨碰面复用；
- **碰面专属**（meetup_id 非空）：字段相同时优先于全局（留给未来「这次碰面单独调」）。

读取顺序：碰面专属 → 全局。
"""
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import get_current_user
from ..models import Preference, User
from ..schemas import PrefParseIn, PreferenceIn
from ..services import llm

router = APIRouter(prefix="/api/preferences", tags=["preferences"])

# 参与持久化的字段（PreferenceIn / Preference 同名）
FIELDS = [
    "brand_include", "brand_exclude", "restaurant_include", "restaurant_exclude",
    "cuisine_include", "cuisine_exclude", "area_include",
    "price_min", "price_max", "radius", "note",
]
LIST_FIELDS = {
    "brand_include", "brand_exclude", "restaurant_include", "restaurant_exclude",
    "cuisine_include", "cuisine_exclude", "area_include",
}


def _row_to_dict(row: Optional[Preference]) -> Dict:
    if row is None:
        return {}
    return {f: getattr(row, f, None) for f in FIELDS}


def apply_prefs(row: Preference, body: PreferenceIn) -> None:
    """把请求体写入 Preference 行（列表去空去重，整体覆盖）。"""
    for f in FIELDS:
        v = getattr(body, f, None)
        if f in LIST_FIELDS:
            cleaned: list = []
            for x in v or []:
                s = str(x).strip()
                if s and s not in cleaned:
                    cleaned.append(s)
            setattr(row, f, cleaned)
        else:
            setattr(row, f, v)
    row.updated_at = datetime.now(timezone.utc)


def prefs_of(db: Session, user_id: str, meetup_id: Optional[str] = None) -> Dict:
    """读取用户偏好：优先碰面专属，其次全局；空值不返回。"""
    row = None
    if meetup_id:
        row = (
            db.query(Preference)
            .filter(Preference.user_id == user_id, Preference.meetup_id == meetup_id)
            .order_by(Preference.updated_at.desc())
            .first()
        )
    if row is None:
        row = (
            db.query(Preference)
            .filter(Preference.user_id == user_id, Preference.meetup_id.is_(None))
            .order_by(Preference.updated_at.desc())
            .first()
        )
    data = _row_to_dict(row)
    return {k: v for k, v in data.items() if v not in (None, [], "")}


@router.get("")
def get_prefs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = (
        db.query(Preference)
        .filter(Preference.user_id == user.id, Preference.meetup_id.is_(None))
        .order_by(Preference.updated_at.desc())
        .first()
    )
    return {
        "ok": True,
        "prefs": _row_to_dict(row),
        "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
    }


@router.put("")
def save_prefs(
    body: PreferenceIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """整体覆盖式保存全局偏好（字段不传 = 置空；列表里的空白项会被过滤掉）。"""
    row = (
        db.query(Preference)
        .filter(Preference.user_id == user.id, Preference.meetup_id.is_(None))
        .order_by(Preference.updated_at.desc())
        .first()
    )
    if row is None:
        row = Preference(id=str(uuid.uuid4()), user_id=user.id, meetup_id=None)
        db.add(row)
    apply_prefs(row, body)
    db.commit()
    return {"ok": True, "prefs": _row_to_dict(row)}


@router.post("/parse")
def parse_prefs(body: PrefParseIn, user: User = Depends(get_current_user)):
    """把用户手写的长文本交给大模型解析成结构化偏好（不落库，前端确认后再保存）。"""
    data = llm.parse_preferences(body.text)
    if "_error" in data:
        return {"ok": False, "reason": data["_error"]}
    return {"ok": True, "prefs": data}
