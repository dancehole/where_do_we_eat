import math
from typing import List, Tuple, Callable


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """两点间距离（公里）。"""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def centroid(points: List[Tuple[float, float]]) -> Tuple[float, float]:
    """同城中心：球面几何质心（cartesian 平均，比经纬度简单平均更准）。"""
    xs = ys = zs = 0.0
    for lat, lng in points:
        rlat, rlng = math.radians(lat), math.radians(lng)
        xs += math.cos(rlat) * math.cos(rlng)
        ys += math.cos(rlat) * math.sin(rlng)
        zs += math.sin(rlat)
    n = len(points)
    xs /= n
    ys /= n
    zs /= n
    lng = math.atan2(ys, xs)
    hyp = math.sqrt(xs * xs + ys * ys)
    lat = math.atan2(zs, hyp)
    return math.degrees(lat), math.degrees(lng)


def equal_cost_center(
    points: List[Tuple[float, float]],
    cost_fn: Callable = haversine,
    step: float = 2.0,
) -> Tuple[float, float]:
    """跨城中心：网格搜索使『每人交通费方差最小』（交通费尽量一样多）。"""
    best = centroid(points)
    best_var = float("inf")

    def variance(center):
        dists = [cost_fn(center[0], center[1], p[0], p[1]) for p in points]
        mean = sum(dists) / len(dists)
        return sum((d - mean) ** 2 for d in dists) / len(dists)

    for s in (step, step / 4, step / 16):
        candidates = [
            (best[0] + s * dx, best[1] + s * dy)
            for dx in (-1, 0, 1)
            for dy in (-1, 0, 1)
        ]
        for c in candidates:
            var = variance(c)
            if var < best_var:
                best_var = var
                best = c
    return best


def is_same_city(points: List[Tuple[float, float]], threshold_km: float = 30.0) -> bool:
    """任意两人距离都 < 阈值 → 同城（聚餐）。"""
    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            if haversine(points[i][0], points[i][1], points[j][0], points[j][1]) > threshold_km:
                return False
    return True
