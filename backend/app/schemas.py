from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class LocationIn(BaseModel):
    lat: float
    lng: float
    nickname: Optional[str] = None
    avatar: Optional[str] = None
    wechat_id: Optional[str] = None


class MeetupCreate(BaseModel):
    nickname: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class ParticipantOut(BaseModel):
    id: str
    nickname: str
    avatar: Optional[str] = None
    wechat_id: Optional[str] = None
    lat: float
    lng: float
    distance_km: Optional[float] = None


class ParticipantUpdate(BaseModel):
    """参与者更新：用于刷新自己的位置/昵称（避免重复加入）。"""
    lat: Optional[float] = None
    lng: Optional[float] = None
    nickname: Optional[str] = None
    avatar: Optional[str] = None


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
    # 菜系筛选：逗号/竖线分隔的字符串（前端数组序列化成 CSV 更稳，避免各端 query 数组写法不一致）
    categories: Optional[str] = None
    near_subway: Optional[bool] = None
    business_district: Optional[bool] = None
    # 高德 POI 搜索半径（米），默认 3000
    radius: Optional[int] = None
    # 勾选「排序更多餐厅」：翻更多页拉候选，再取评分最好的前 25 家参与排序
    more: Optional[bool] = None

    # —— 地址附近：用自定义坐标作为检索中心，替代「碰面中心」 ——
    # 来自地图选点 / 文字搜索（商圈·详细地址）/ 某个碰面码计算的中心。
    near_lat: Optional[float] = None
    near_lng: Optional[float] = None
    near_addr: Optional[str] = None

    # —— 想去的品牌/餐厅：输入后无论多远都保证至少搜到一个并展示，理由「你想吃 X」 ——
    want: Optional[str] = None


class PreferenceIn(BaseModel):
    """用户偏好。空列表 = 清空该项；不传 = 保持原值（整体覆盖式保存）。"""

    brand_include: Optional[List[str]] = None
    brand_exclude: Optional[List[str]] = None
    restaurant_include: Optional[List[str]] = None
    restaurant_exclude: Optional[List[str]] = None
    # 菜系：喜欢 / 不喜欢（如 ["日本料理", "火锅店"] / ["粤菜", "西餐"]）
    cuisine_include: Optional[List[str]] = None
    cuisine_exclude: Optional[List[str]] = None
    # 商圈优先
    area_include: Optional[List[str]] = None
    # 默认筛选
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    radius: Optional[int] = None
    # 手写长文本（可交 AI 解析）
    note: Optional[str] = None


class PreferenceOut(PreferenceIn):
    updated_at: Optional[datetime] = None


class PrefParseIn(BaseModel):
    """把用户手写的长文本交给 AI 解析成结构化偏好。"""
    text: str


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
    """AI 推送入参。

    推荐用法：只传 `code`，后端会自己从碰面中心点 + 该用户偏好 + 已排序餐厅（restaurants 表）
    拼装完整上下文；仍兼容旧用法（前端直接传 center_name / budget / prefers / restaurants）。
    """

    code: Optional[str] = None
    center_name: Optional[str] = None
    budget: Optional[float] = None
    prefers: Optional[str] = None
    restaurants: Optional[List[dict]] = None
