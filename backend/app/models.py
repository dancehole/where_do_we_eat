from sqlalchemy import (
    Column, String, DateTime, Enum as SAEnum, DECIMAL,
    ForeignKey, JSON, Text,
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
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
    __tablename__ = "preferences"
    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(36), ForeignKey("users.id"))
    meetup_id = Column(String(36), ForeignKey("meetups.id"), nullable=True)
    brand_include = Column(JSON, nullable=True)
    brand_exclude = Column(JSON, nullable=True)
    restaurant_include = Column(JSON, nullable=True)
    restaurant_exclude = Column(JSON, nullable=True)
