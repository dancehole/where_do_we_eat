from typing import List, Dict, Optional

# 把用户口语化的菜系词映射到高德 POI 的 type 细分词（高德用的是「日本料理」「广东菜」这类写法）。
# 匹配时只要任一别名出现在 POI 的完整品类串里就算命中。
CUISINE_ALIASES: Dict[str, List[str]] = {
    "日料": ["日本料理", "日式"],
    "日式": ["日本料理", "日式"],
    "火锅": ["火锅"],
    "粤菜": ["广东菜", "粤菜", "潮汕菜", "茶餐厅"],
    "西餐": ["西餐", "西餐厅", "牛排", "意式", "法式"],
    "韩餐": ["韩国料理", "韩式"],
    "川菜": ["川菜", "四川菜"],
    "湘菜": ["湘菜", "湖南菜"],
    "江浙菜": ["江浙菜", "杭帮菜", "本帮菜", "淮扬菜", "浙江菜"],
    "东北菜": ["东北菜"],
    "西北菜": ["西北菜", "新疆菜", "陕西菜"],
    "烧烤": ["烧烤", "烤串"],
    "快餐": ["快餐", "肯德基", "麦当劳", "汉堡"],
    "面食": ["面馆", "面食", "拉面", "米线"],
    "小吃": ["小吃", "大排档"],
    "海鲜": ["海鲜"],
    "素食": ["素食", "轻食", "沙拉"],
    "甜品": ["甜品", "蛋糕", "烘焙"],
    "咖啡": ["咖啡"],
    "东南亚": ["泰国菜", "越南菜", "东南亚"],
    "自助餐": ["自助餐", "自助"],
}


def _num(v):
    """把 Decimal / str / int 统一成 float；无法转换返回 None。

    注意：偏好里的 price_min/price_max 从 MySQL DECIMAL 列读出是 Decimal，
    不做转换会和高德返回的 float 相减报 TypeError。
    """
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _cuisine_hit(hay: str, keyword: str) -> bool:
    """菜系关键词是否命中该 POI 的品类串（支持别名）。"""
    if not keyword:
        return False
    terms = CUISINE_ALIASES.get(keyword, [keyword])
    return any(t and t in hay for t in terms)


def score_restaurants(
    restaurants: List[Dict],
    filters: Dict,
    prefs: Dict,
    weights: Optional[Dict] = None,
) -> List[Dict]:
    """基线权重排序：价格 / 菜系 / 交通 / 评分 + 用户偏好（优先/排除）。"""
    w = weights or {"price": 0.25, "category": 0.15, "traffic": 0.2, "rating": 0.35, "distance": 0.15}
    inc_brands = set(prefs.get("brand_include") or [])
    exc_brands = set(prefs.get("brand_exclude") or [])
    inc_res = set(prefs.get("restaurant_include") or [])
    exc_res = set(prefs.get("restaurant_exclude") or [])
    inc_cuisines = [c for c in (prefs.get("cuisine_include") or []) if c]
    exc_cuisines = [c for c in (prefs.get("cuisine_exclude") or []) if c]
    inc_areas = [a for a in (prefs.get("area_include") or []) if a]
    cats = set(filters.get("categories") or [])

    result: List[Dict] = []
    for r in restaurants:
        name = r.get("name") or ""
        cat = r.get("category") or ""
        cuisine = r.get("cuisine") or ""
        # 品类串（完整 type + 细分），菜系匹配都在它上面做（支持别名，如「日料」→「日本料理」）
        hay = f"{cat} {cuisine}"
        reasons: List[str] = []
        score = 0.0

        # 排除项直接跳过
        if any(ex and ex in name for ex in exc_res) or any(ex and ex in name for ex in exc_brands):
            continue

        # 优先项加分
        if any(inc and inc in name for inc in inc_brands):
            score += 12
            reasons.append("你优先的品牌")
        if any(inc and inc in name for inc in inc_res):
            score += 10
            reasons.append("你点名想去的店")

        # 菜系偏好：不喜欢的直接排除，喜欢的加分（高德本身不支持“不喜欢”，在排序层实现）
        if any(_cuisine_hit(hay, c) for c in exc_cuisines):
            continue
        liked = next((c for c in inc_cuisines if _cuisine_hit(hay, c)), None)
        if liked:
            score += 12
            reasons.append(f"你喜欢的菜系：{liked}")

        # 商圈优先
        area = r.get("business_area") or ""
        hit_area = next((a for a in inc_areas if a and a in area), None)
        if hit_area:
            score += 8
            reasons.append(f"优先商圈：{hit_area}")

        # 菜系匹配（本次筛选的 categories；同样支持口语别名）
        if cats and any(_cuisine_hit(hay, c) for c in cats):
            score += w["category"] * 100
            reasons.append(f"符合菜系：{cuisine or cat}")

        # 评分（0~35 分制，rating 5 分满分）
        rating = _num(r.get("rating"))
        if rating is not None:
            score += (rating / 5) * w["rating"] * 100
            reasons.append(f"评分 {rating}")

        # 价格：在预算内给高分，越接近上限越优；超预算扣分
        price = _num(r.get("avg_price"))
        price_min = _num(filters.get("price_min"))
        price_max = _num(filters.get("price_max"))
        if price is not None:
            if price_min is not None and price < price_min:
                score -= 12
                reasons.append(f"低于预算下限（{price_min}）")
            elif price_max is not None and price > price_max:
                score -= 12
                reasons.append(f"高于预算上限（{price_max}）")
            else:
                pivot = price_max or price
                dev = abs(price - pivot) / (pivot + 1)
                score += w["price"] * 100 * (1 - min(dev, 1))
                if price_max is not None:
                    reasons.append(f"人均 ¥{price:.0f}（预算内）")

        # 交通：近地铁 / 近商圈
        if filters.get("near_subway") and r.get("near_subway"):
            score += w["traffic"] * 0.5 * 100
            reasons.append("近地铁")
        if filters.get("business_district") and r.get("business_district"):
            score += w["traffic"] * 0.5 * 100
            reasons.append(f"近商圈（{r.get('business_area')}）")

        # 距离：离中心点越近越好（0~15 分制）
        dist = _num(r.get("distance"))
        if dist is not None:
            radius = _num(filters.get("radius")) or 3000
            score += w["distance"] * 100 * (1 - min(dist / radius, 1))
            reasons.append(f"距中心 {dist}m")

        r2 = dict(r)
        r2["score"] = round(max(0.0, min(score, 100)), 1)
        r2["reason"] = "；".join(reasons) or "综合评分较高"
        result.append(r2)

    result.sort(key=lambda x: x["score"], reverse=True)
    return result
