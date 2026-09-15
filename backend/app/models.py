from sqlalchemy import (
    Column, String, DateTime, Enum as SAEnum, DECIMAL,
    ForeignKey, JSON, Text, Integer, Date,
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone, date
import uuid
from .core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=_uuid)
    device_id = Column(String(128), unique=True, index=True)
    nickname = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=_now)


class Meetup(Base):
    __tablename__ = "meetups"
    id = Column(String(36), primary_key=True, default=_uuid)
    code = Column(String(8), unique=True, index=True)
    creator_id = Column(String(36), ForeignKey("users.id"))
    status = Column(SAEnum("active", "ended"), default="active")
    meetup_type = Column(SAEnum("same_city", "travel"), nullable=True)
    # 用户手动选择的「碰面规则」（如 same_city:nearest / travel:time）。
    # 与自动判定的 meetup_type 分离：当前仅持久化用户选择，具体算法后续补充。
    rule = Column(String(64), nullable=True)
    center_lat = Column(DECIMAL(10, 7), nullable=True)
    center_lng = Column(DECIMAL(10, 7), nullable=True)
    created_at = Column(DateTime, default=_now)
    ended_at = Column(DateTime, nullable=True)

    participants = relationship(
        "Participant", back_populates="meetup", cascade="all, delete-orphan"
    )
    restaurants = relationship(
        "Restaurant", back_populates="meetup", cascade="all, delete-orphan"
    )


class Participant(Base):
    __tablename__ = "participants"
    id = Column(String(36), primary_key=True, default=_uuid)
    meetup_id = Column(String(36), ForeignKey("meetups.id"))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    nickname = Column(String(64))
    avatar = Column(String(512), nullable=True)       # 微信头像 URL（小程序端 getUserProfile 获取）
    wechat_id = Column(String(128), nullable=True, index=True)  # 微信 openid（小程序匿名身份，更稳定）
    lat = Column(DECIMAL(10, 7))
    lng = Column(DECIMAL(10, 7))
    joined_at = Column(DateTime, default=_now)
    meetup = relationship("Meetup", back_populates="participants")


class Restaurant(Base):
    __tablename__ = "restaurants"
    id = Column(String(36), primary_key=True, default=_uuid)
    meetup_id = Column(String(36), ForeignKey("meetups.id"))
    source = Column(String(32))
    name = Column(String(256))
    lat = Column(DECIMAL(10, 7), nullable=True)
    lng = Column(DECIMAL(10, 7), nullable=True)
    address = Column(String(512), nullable=True)
    category = Column(String(128), nullable=True)
    avg_price = Column(DECIMAL(10, 2), nullable=True)
    rating = Column(DECIMAL(3, 1), nullable=True)
    business_status = Column(String(32), nullable=True)
    score = Column(DECIMAL(5, 2), nullable=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now)
    meetup = relationship("Meetup", back_populates="restaurants")


class Preference(Base):
    """用户偏好。

    meetup_id 为空 = 该用户的**全局偏好**（设置页写的就是这条，跨碰面复用）；
    非空 = 某次碰面的专属覆盖。读取时优先取碰面专属，取不到再退回全局。
    """

    __tablename__ = "preferences"
    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(36), ForeignKey("users.id"))
    meetup_id = Column(String(36), ForeignKey("meetups.id"), nullable=True)

    # 品牌 / 具体餐厅 的偏好与排除（按名字子串匹配）
    brand_include = Column(JSON, nullable=True)
    brand_exclude = Column(JSON, nullable=True)
    restaurant_include = Column(JSON, nullable=True)
    restaurant_exclude = Column(JSON, nullable=True)

    # 菜系偏好（匹配高德 type 的细分段，如「日本料理」「火锅店」；也支持“日料/火锅”这类口语词）
    cuisine_include = Column(JSON, nullable=True)
    cuisine_exclude = Column(JSON, nullable=True)

    # 商圈优先（匹配高德 business_area）
    area_include = Column(JSON, nullable=True)

    # 默认筛选（单次请求显式传的 filters 优先级更高）
    price_min = Column(DECIMAL(10, 2), nullable=True)
    price_max = Column(DECIMAL(10, 2), nullable=True)
    radius = Column(Integer, nullable=True)          # 高德 POI 搜索半径（米）

    # 用户手写的长文本偏好（可用 AI 解析成上面这些结构化字段）
    note = Column(Text, nullable=True)

    updated_at = Column(DateTime, default=_now, onupdate=_now)


# ─────────────────────────────────────────────────────────────────────────────
# 排期（多人约时间）：与「碰面」解耦，碰面解决「地点」，排期解决「时间」
# ─────────────────────────────────────────────────────────────────────────────

class Schedule(Base):
    """排期表：发起者定一个时间段，自己/他人勾选有空状态，合并出热度日历。"""

    __tablename__ = "schedules"
    id = Column(String(36), primary_key=True, default=_uuid)
    code = Column(String(8), unique=True, index=True)
    creator_id = Column(String(36), ForeignKey("users.id"))
    title = Column(String(128))
    description = Column(Text, nullable=True)
    # 时间段（含两端）
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    # 是否精确到小时（开启后按 6 个固定 2 小时槽位标记）
    granular_hours = Column(String(1), default="0")  # '0'|'1'
    # open=可编辑；closed=发起者已锁定（如确定好、买票了）
    status = Column(SAEnum("open", "closed"), default="open")
    created_at = Column(DateTime, default=_now)
    closed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    participants = relationship(
        "ScheduleParticipant", back_populates="schedule", cascade="all, delete-orphan"
    )


class ScheduleParticipant(Base):
    """排期参与者：一人一行，本人作答直接存 availability JSON（整体 upsert）。"""

    __tablename__ = "schedule_participants"
    id = Column(String(36), primary_key=True, default=_uuid)
    schedule_id = Column(String(36), ForeignKey("schedules.id"))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    nickname = Column(String(64))
    avatar = Column(String(512), nullable=True)        # 微信头像 URL
    wechat_id = Column(String(128), nullable=True, index=True)  # 微信 openid
    # 本人的有空数据：{ "YYYY-MM-DD": { "day": level|null, "slots": { slot: level|null } } }
    availability = Column(JSON, nullable=True)
    joined_at = Column(DateTime, default=_now)
    schedule = relationship("Schedule", back_populates="participants")
