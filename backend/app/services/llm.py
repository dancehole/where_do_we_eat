import json
import re
from typing import List, Dict, Optional

from ..core.config import settings

# 结构化偏好的字段说明（喂给模型，要求它按这个结构返回 JSON）
PREF_FIELDS = {
    "cuisine_include": "喜欢的菜系，如 [\"日本料理\", \"火锅店\"]",
    "cuisine_exclude": "不喜欢的菜系，如 [\"广东菜\", \"西餐\"]",
    "brand_include": "喜欢的品牌，如 [\"海底捞\", \"星巴克\"]",
    "brand_exclude": "不想去的品牌，如 [\"麦当劳\"]",
    "restaurant_include": "点名的具体餐厅",
    "restaurant_exclude": "不想去的具体餐厅",
    "area_include": "优先的商圈，如 [\"天河城\"]",
    "price_min": "人均下限（数字或 null）",
    "price_max": "人均上限（数字或 null）",
    "radius": "搜索半径（米，数字或 null）",
}


def _client():
    from openai import OpenAI

    return OpenAI(
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL or "https://api.deepseek.com",
    )


def _model() -> str:
    return settings.LLM_MODEL or "deepseek-chat"


def _strip_json(text: str) -> str:
    """模型偶尔会用 ```json 包裹，剥掉围栏。"""
    t = (text or "").strip()
    t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    return t.strip()


def parse_preferences(text: str) -> Dict:
    """把用户手写的长文本偏好，交给大模型解析成结构化偏好。

    返回 dict（字段见 PREF_FIELDS）；失败返回 {"_error": "..."}。
    """
    if not settings.LLM_API_KEY:
        return {"_error": "未配置 LLM_API_KEY，无法智能解析（可在设置页手动填写）"}
    if not (text or "").strip():
        return {}
    fields_desc = "\n".join(f"- {k}: {v}" for k, v in PREF_FIELDS.items())
    prompt = (
        "下面是一段用户对『吃饭选餐厅』的自由描述。请提取成 JSON，字段如下"
        "（没有提到的字段给 null，不要编造；菜系/品牌/餐厅/商圈尽量归一化成常见中文名）：\n"
        f"{fields_desc}\n\n"
        "只输出 JSON，不要任何解释。\n\n"
        f"用户描述：\n{text}"
    )
    try:
        resp = _client().chat.completions.create(
            model=_model(),
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        data = json.loads(_strip_json(resp.choices[0].message.content or "{}"))
        # 只保留认识的字段
        return {k: v for k, v in data.items() if k in PREF_FIELDS}
    except Exception as e:  # noqa: BLE001
        return {"_error": f"AI 解析失败：{e}"}


def prefs_to_text(prefs: Dict) -> str:
    """把结构化偏好拼成一句中文描述，用于 AI 推送的上下文。"""
    if not prefs:
        return "无特别偏好"
    parts: List[str] = []
    if prefs.get("cuisine_include"):
        parts.append("喜欢菜系：" + "、".join(map(str, prefs["cuisine_include"])))
    if prefs.get("cuisine_exclude"):
        parts.append("不喜欢菜系：" + "、".join(map(str, prefs["cuisine_exclude"])))
    if prefs.get("brand_include"):
        parts.append("偏好品牌：" + "、".join(map(str, prefs["brand_include"])))
    if prefs.get("brand_exclude"):
        parts.append("排除品牌：" + "、".join(map(str, prefs["brand_exclude"])))
    if prefs.get("restaurant_include"):
        parts.append("点名想去：" + "、".join(map(str, prefs["restaurant_include"])))
    if prefs.get("restaurant_exclude"):
        parts.append("明确不去：" + "、".join(map(str, prefs["restaurant_exclude"])))
    if prefs.get("area_include"):
        parts.append("优先商圈：" + "、".join(map(str, prefs["area_include"])))
    pmin, pmax = prefs.get("price_min"), prefs.get("price_max")
    if pmin is not None or pmax is not None:
        parts.append(f"预算人均 {pmin if pmin is not None else '不限'}~{pmax if pmax is not None else '不限'} 元")
    if prefs.get("radius"):
        parts.append(f"搜索半径 {prefs['radius']} 米")
    if prefs.get("note"):
        parts.append("补充说明：" + str(prefs["note"]).strip())
    return "；".join(parts) if parts else "无特别偏好"


def ai_recommend(
    center_name: str,
    budget: float,
    prefers: str,
    restaurants: List[Dict],
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    """调用 OpenAI 兼容大模型（默认 DeepSeek）生成推荐列表 + 理由。

    后期换模型只需在 .env 修改 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL，
    无需改动本文件。
    """
    api_key = api_key or settings.LLM_API_KEY
    base_url = base_url or settings.LLM_BASE_URL or "https://api.deepseek.com"
    model = model or settings.LLM_MODEL or "deepseek-chat"
    if not api_key:
        return "（未配置 LLM_API_KEY，跳过 AI 推送；已用规则权重给出推荐）"
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key, base_url=base_url)
        ctx = "\n".join(
            f"- {r.get('name')} 人均{r.get('avg_price')} 评分{r.get('rating')} 品类{r.get('category')}"
            for r in restaurants[:30]
        )
        budget_txt = f"希望人均约{budget:.0f}元，" if budget else ""
        prompt = (
            f"我正在考虑在{center_name}附近吃饭，{budget_txt}偏好：{prefers}。"
            f"以下是候选餐厅（已按规则权重初排）：\n{ctx}\n"
            f"请从中挑选最合适的20家，按推荐度排序，"
            f"并用中文给出每家的简短推荐理由。若候选不足20家就按实际数量给。"
        )
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        return resp.choices[0].message.content
    except Exception as e:  # noqa: BLE001
        return f"（AI 调用失败：{e}）"
