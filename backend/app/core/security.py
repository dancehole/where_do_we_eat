from fastapi import Header, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from ..models import User
import uuid


def get_current_user(
    device_id: str = Header(None, alias="X-Device-Id"),
    db: Session = Depends(get_db),
):
    """无登录身份：用设备匿名 UUID 标识用户，首次出现自动创建。"""
    if not device_id:
        raise HTTPException(status_code=401, detail="Missing X-Device-Id header")
    user = db.query(User).filter(User.device_id == device_id).first()
    if not user:
        user = User(id=str(uuid.uuid4()), device_id=device_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
