from typing import List, Dict, Optional

from ..core.config import settings


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
        prompt = (
            f"我正在考虑在{center_name}附近吃饭，希望人均约{budget}元，偏好：{prefers}。"
            f"以下是候选餐厅：\n{ctx}\n请从中挑选最合适的20家，按推荐度排序，"
            f"并用中文给出每家的简短推荐理由。"
        )
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        return resp.choices[0].message.content
    except Exception as e:  # noqa: BLE001
        return f"（AI 调用失败：{e}）"
