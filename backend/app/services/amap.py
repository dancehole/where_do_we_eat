import os
import logging
import requests
from typing import List, Dict, Optional

from ..core.config import settings

AMAP_AROUND_URL = "https://restapi.amap.com/v3/place/around"


def _to_float(v):
    """高德部分字段可能为 list / str / None，统一转 float 或 None。"""
    if v is None or v == "":
        return None
    if isinstance(v, list):
        v = v[0] if v else None
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def search_restaurants(
    center_lat: float,
    center_lng: float,
    radius: int = 3000,
    keywords: str = "餐厅",
    types: str = "餐饮服务",
    max_count: int = 20,
    key: Optional[str] = None,
) -> List[Dict]:
    """高德 POI 周边检索（替代无 API 的大众点评/美团）。无 Key 时返回空列表。"""
    key = key or settings.AMAP_WEB_KEY
    if not key:
        return []
    params = {
        "key": key,
        "location": f"{center_lng},{center_lat}",
        "radius": radius,
        "keywords": keywords,
        "types": types,
        "offset": min(max_count, 25),
        "page": 1,
        "extensions": "all",
        "sortrule": "weight",
    }
    try:
        r = requests.get(AMAP_AROUND_URL, params=params, timeout=8)
        data = r.json()
    except Exception:
        return []
    if data.get("status") != "1":
        logging.warning(
            "[amap] 高德返回错误 status=%s info=%s infocode=%s",
            data.get("status"), data.get("info"), data.get("infocode"),
        )
        return []
    out: List[Dict] = []
    for p in data.get("pois", []):
        loc = p.get("location", "")
        lng, lat = (loc.split(",") + ["", ""])[:2] if loc else ("", "")
        biz = p.get("biz_ext")
        if isinstance(biz, list):
            biz = biz[0] if biz else {}
        biz = biz or {}
        price = _to_float(biz.get("cost"))
        rating = _to_float(biz.get("rating"))
        ptype = p.get("type") or ""           # 例："餐饮服务;中餐厅;火锅店"
        segments = [s for s in ptype.split(";") if s]
        # 第一个是粗类（餐饮服务），其后是菜系/细分，取最具体的品类作为 cuisine
        cuisine = segments[-1] if len(segments) > 1 else (segments[0] if segments else "")
        # 高德个别字段可能返回 list，统一转字符串
        addr = p.get("address") or ""
        if isinstance(addr, list):
            addr = addr[0] if addr else ""
        biz_area = p.get("business_area") or ""
        if isinstance(biz_area, list):
            biz_area = biz_area[0] if biz_area else ""
        tel = p.get("tel") or ""
        if isinstance(tel, list):
            tel = tel[0] if tel else ""
        dist = p.get("distance")
        out.append(
            {
                "name": p.get("name"),
                "lat": float(lat) if lat else None,
                "lng": float(lng) if lng else None,
                "address": addr,
                "category": ptype,                 # 完整品类串，供前端筛选匹配
                "cuisine": cuisine,                # 细分品类（中餐厅/火锅店…）
                "avg_price": price,
                "rating": rating,
                "distance": int(_to_float(dist)) if _to_float(dist) is not None else None,  # 距中心点的距离(米)
                "business_status": "营业" if p.get("business") != "0" else "休息",
                "business_area": biz_area,         # 高德商圈名
                "business_district": bool(biz_area),
                "tel": tel,
                "near_subway": bool(p.get("subway")),  # 高德返回附近地铁站名
            }
        )
    return out[:max_count]
