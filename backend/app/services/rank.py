from typing import List, Dict, Optional


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
    cats = set(filters.get("categories") or [])

    result: List[Dict] = []
    for r in restaurants:
        name = r.get("name") or ""
        cat = r.get("category") or ""
        cuisine = r.get("cuisine") or ""
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

        # 菜系匹配（用细分品类匹配，避免重复）
        if cats and any(c and c in cat for c in cats):
            score += w["category"] * 100
            reasons.append(f"符合菜系：{cuisine or cat}")

        # 评分（0~35 分制，rating 5 分满分）
        rating = r.get("rating")
        if rating is not None:
            score += (rating / 5) * w["rating"] * 100
            reasons.append(f"评分 {rating}")

        # 价格：在预算内给高分，越接近上限越优；超预算扣分
        price = r.get("avg_price")
        price_min = filters.get("price_min")
        price_max = filters.get("price_max")
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
        dist = r.get("distance")
        if dist is not None:
            radius = filters.get("radius") or 3000
            score += w["distance"] * 100 * (1 - min(dist / radius, 1))
            reasons.append(f"距中心 {dist}m")

        r2 = dict(r)
        r2["score"] = round(max(0.0, min(score, 100)), 1)
        r2["reason"] = "；".join(reasons) or "综合评分较高"
        result.append(r2)

    result.sort(key=lambda x: x["score"], reverse=True)
    return result
