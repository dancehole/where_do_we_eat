from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, date


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
    # 可选：创建碰面时顺手关联一个时间排期（排期需先创建，用其 code 关联）
    schedule_code: Optional[str] = None


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
    rule: Optional[str] = None
    center_lat: Optional[float] = None
    center_lng: Optional[float] = None
    created_at: datetime
    participant_count: int
    participants: List[ParticipantOut] = []
    share_url: Optional[str] = None
    # 本次操作产生的参与者 id（创建者本人 / 刚加入的人），供前端持久化识别「我」
    my_participant_id: Optional[str] = None
    # 关联的时间排期（可空）：code 用于跳转，title 用于展示
    schedule_code: Optional[str] = None
    schedule_title: Optional[str] = None


class MeetupRuleIn(BaseModel):
    """用户手动选择的碰面规则（如 same_city:nearest / travel:time）。"""
    rule: str


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


# ─────────────────────────────────────────────────────────────────────────────
# 排期（多人约时间）
# ─────────────────────────────────────────────────────────────────────────────

class ScheduleParticipantOut(BaseModel):
    id: str
    nickname: str
    avatar: Optional[str] = None
    wechat_id: Optional[str] = None
    # 本人的有空数据（详情/编辑时随本人返回；合并图由 /merge 聚合，不在这里展开）
    availability: Optional[Dict[str, Any]] = None


class ScheduleOut(BaseModel):
    id: str
    code: str
    title: str
    description: Optional[str] = None
    start_date: date
    end_date: date
    granular_hours: bool
    status: str
    creator_id: Optional[str] = None
    is_creator: Optional[bool] = None
    created_at: datetime
    closed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    participant_count: int
    participants: List[ScheduleParticipantOut] = []
    share_url: Optional[str] = None
    # 本次操作者在此排期中的参与者 id（创建者/刚加入的人），前端持久化以识别「我」
    my_participant_id: Optional[str] = None
    # 本人的 availability（仅当传入有效 pid 或本人是创建者时返回）
    my_availability: Optional[Dict[str, Any]] = None


class ScheduleCreate(BaseModel):
    """创建排期：标题/描述/时间段/是否精确到小时。"""
    title: str
    description: Optional[str] = None
    start_date: date
    end_date: date
    granular_hours: bool = False
    nickname: Optional[str] = None
    avatar: Optional[str] = None
    wechat_id: Optional[str] = None


class ScheduleMetaUpdate(BaseModel):
    """修改排期元信息（任意字段可空；时间段可后续修改）。"""
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    granular_hours: Optional[bool] = None


class ScheduleJoinIn(BaseModel):
    nickname: Optional[str] = None
    avatar: Optional[str] = None
    wechat_id: Optional[str] = None


class AvailabilityIn(BaseModel):
    """保存本人作答：整体 upsert 本人的 availability JSON。"""
    participant_id: str
    availability: Dict[str, Any]
