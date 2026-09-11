import json
from app.services import amap, llm


print("== 高德 POI 周边检索 (北京国贸) ==")
try:
    rs = amap.search_restaurants(39.9042, 116.4074, radius=2000, max_count=5)
    print("count:", len(rs))
    for r in rs[:3]:
        print(" -", r["name"], "| price", r.get("avg_price"),
              "| rating", r.get("rating"), "| cat", r.get("category"))
except Exception as e:
    print("ERR", repr(e))

print("\n== DeepSeek 推荐 ==")
try:
    text = llm.ai_recommend(
        center_name="国贸", budget=100, prefers="连锁品牌、评分高、近地铁",
        restaurants=[
            {"name": "海底捞", "avg_price": 120, "rating": 4.6, "category": "火锅"},
            {"name": "西贝莜面村", "avg_price": 95, "rating": 4.5, "category": "西北菜"},
            {"name": "麦当劳", "avg_price": 35, "rating": 4.2, "category": "快餐"},
        ],
    )
    print(text[:600])
except Exception as e:
    print("ERR", repr(e))
