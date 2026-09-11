import logging
import os
import tempfile
from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/debug", tags=["debug"])

LOG_PATH = os.path.join(tempfile.gettempdir(), "amap_debug.log")

logger = logging.getLogger("amap_debug")
logger.setLevel(logging.INFO)
_handler = logging.FileHandler(LOG_PATH, encoding="utf-8")
_handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
if not logger.handlers:
    logger.addHandler(_handler)


@router.post("/log")
async def log_from_browser(req: Request):
    """前端浏览器把调试信息（如高德加载报错）打到后端日志 /tmp/amap_debug.log"""
    try:
        data = await req.json()
    except Exception:
        body = await req.body()
        data = {"raw": body.decode("utf-8", "ignore")}
    msg = data.get("msg") or data.get("raw") or str(data)
    level = (data.get("level") or "INFO").upper()
    logger.log(getattr(logging, level, logging.INFO), f"[browser] {msg}")
    return {"ok": True, "saved": True}
