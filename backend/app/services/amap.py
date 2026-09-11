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


def _str(v):
    """高德个别字段会返回 list，统一取第一个元素并转成字符串。"""
    if isinstance(v, list):
        v = v[0] if v else ""
    return v or ""


def _photo(p: Dict) -> Optional[str]:
    """取高德 POI 的第一张实景图 URL（没有则 None）。"""
    photos = p.get("photos")
    if isinstance(photos, list) and photos:
        first = photos[0]
        if isinstance(first, dict):
            url = first.get("url")
            return url if isinstance(url, str) and url else None
    return None


def _parse_poi(p: Dict) -> Optional[Dict]:
    """高德 POI -> 内部结构（字段可能缺失/为 list，统一归一化）。"""
    name = _str(p.get("name"))
    if not name:
        return None
    loc = _str(p.get("location"))
    lng, lat = (loc.split(",") + ["", ""])[:2] if loc else ("", "")
    biz = p.get("biz_ext")
    if isinstance(biz, list):
        biz = biz[0] if biz else {}
    biz = biz or {}
    price = _to_float(biz.get("cost"))
    rating = _to_float(biz.get("rating"))
    ptype = _str(p.get("type"))              # 例："餐饮服务;中餐厅;火锅店"
    segments = [s for s in ptype.split(";") if s]
    # 第一个是粗类（餐饮服务），其后是菜系/细分，取最具体的品类作为 cuisine
    cuisine = segments[-1] if len(segments) > 1 else (segments[0] if segments else "")
    biz_area = _str(p.get("business_area"))
    dist = _to_float(p.get("distance"))
    return {
        "name": name,
        "lat": float(lat) if lat else None,
        "lng": float(lng) if lng else None,
        "address": _str(p.get("address")),
        "category": ptype,                 # 完整品类串，供前端筛选匹配
        "cuisine": cuisine,                # 细分品类（中餐厅/火锅店…）
        "avg_price": price,
        "rating": rating,
        "distance": int(dist) if dist is not None else None,  # 距中心点的距离(米)
        "business_status": "营业" if p.get("business") != "0" else "休息",
        "business_area": biz_area,         # 高德商圈名
        "business_district": bool(biz_area),
        "photo": _photo(p),                # 第一张实景图（可能为空）
        "tel": _str(p.get("tel")),
        "near_subway": bool(p.get("subway")),  # 高德返回附近地铁站名
    }


def search_restaurants(
    center_lat: float,
    center_lng: float,
    radius: int = 3000,
    keywords: str = "餐厅",
    types: str = "餐饮服务",
    max_count: int = 25,
    key: Optional[str] = None,
    pages: int = 1,
) -> List[Dict]:
    """高德 POI 周边检索（替代无 API 的大众点评/美团）。无 Key 时返回空列表。

    - 单页最多 25 条；`pages` > 1 时翻页抓取更多候选（用于「排序更多餐厅」）。
    - 结果按 (name, 坐标) 去重后截取前 `max_count` 条。
    - `keywords` / `types` 支持高德的多值语法（用 `|` 分隔），可用来按菜系扩展搜索。
    """
    key = key or settings.AMAP_WEB_KEY
    if not key:
        return []
    per_page = min(max(max_count, 1), 25)
    out: List[Dict] = []
    seen = set()
    for page in range(1, max(1, pages) + 1):
        params = {
            "key": key,
            "location": f"{center_lng},{center_lat}",
            "radius": radius,
            "keywords": keywords,
            "types": types,
            "offset": per_page,
            "page": page,
            "extensions": "all",
            "sortrule": "weight",
        }
        try:
            r = requests.get(AMAP_AROUND_URL, params=params, timeout=8)
            data = r.json()
        except Exception:
            break
        if data.get("status") != "1":
            logging.warning(
                "[amap] 高德返回错误 status=%s info=%s infocode=%s",
                data.get("status"), data.get("info"), data.get("infocode"),
            )
            break
        pois = data.get("pois") or []
        if not pois:
            break
        for p in pois:
            item = _parse_poi(p)
            if not item:
                continue
            dedup_key = f"{item['name']}|{item.get('lat')}|{item.get('lng')}"
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            out.append(item)
        if len(out) >= max_count:
            break
    return out[:max_count]
