from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class LocationIn(BaseModel):
    lat: float
    lng: float
    nickname: Optional[str] = None


class MeetupCreate(BaseModel):
    nickname: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class ParticipantOut(BaseModel):
    id: str
    nickname: str
    lat: float
    lng: float
    distance_km: Optional[float] = None


class ParticipantUpdate(BaseModel):
    """参与者更新：用于刷新自己的位置/昵称（避免重复加入）。"""
    lat: Optional[float] = None
    lng: Optional[float] = None
    nickname: Optional[str] = None


class MeetupOut(BaseModel):
    id: str
    code: str
    status: str
    meetup_type: Optional[str] = None
    center_lat: Optional[float] = None
    center_lng: Optional[float] = None
    created_at: datetime
    participant_count: int
    participants: List[ParticipantOut] = []
    share_url: Optional[str] = None
    # 本次操作产生的参与者 id（创建者本人 / 刚加入的人），供前端持久化识别「我」
    my_participant_id: Optional[str] = None


class RestaurantFilter(BaseModel):
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    categories: Optional[List[str]] = None
    near_subway: Optional[bool] = None
    business_district: Optional[bool] = None


class PreferenceIn(BaseModel):
    brand_include: Optional[List[str]] = None
    brand_exclude: Optional[List[str]] = None
    restaurant_include: Optional[List[str]] = None
    restaurant_exclude: Optional[List[str]] = None


class RestaurantOut(BaseModel):
    id: str
    name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    category: Optional[str] = None
    avg_price: Optional[float] = None
    rating: Optional[float] = None
    business_status: Optional[str] = None
    score: Optional[float] = None
    reason: Optional[str] = None


class AIRecommendIn(BaseModel):
    center_name: str = "市中心"
    budget: float = 100.0
    prefers: str = "靠近商圈、交通方便、优先连锁品牌、评分高"
    restaurants: List[dict] = []
