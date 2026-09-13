"""微信小程序登录：前端 Taro.login() 拿到 code，这里用 code2session 换 openid。

设计：
- 仅用于「微信小程序」端获取用户匿名身份（openid）。本应用仍保持**免登录**，openid 作为更稳定的微信身份，
  与既有 device_id 并行使用，不破坏任何现有逻辑。
- 未配置 WECHAT_APPID/WECHAT_SECRET 时优雅返回 ok:False（小程序端自动回退到 device_id 匿名身份）。
"""
import logging
import requests
from fastapi import APIRouter

from ..core.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

WECHAT_CODE2SESSION = "https://api.weixin.qq.com/sns/jscode2session"


@router.get("/wechat")
def wechat_login(code: str = ""):
    """用 wx.login 的 code 换取 openid（匿名，不含敏感信息）。"""
    appid = settings.WECHAT_APPID
    secret = settings.WECHAT_SECRET
    if not appid or not secret:
        return {"ok": False, "reason": "未配置 WECHAT_APPID/WECHAT_SECRET（小程序将回退到设备匿名身份）"}
    if not code:
        return {"ok": False, "reason": "缺少 code"}

    try:
        r = requests.get(
            WECHAT_CODE2SESSION,
            params={
                "appid": appid,
                "secret": secret,
                "js_code": code,
                "grant_type": "authorization_code",
            },
            timeout=8,
        )
        d = r.json()
    except Exception as e:
        logging.warning("[wechat] code2session 请求失败: %s", e)
        return {"ok": False, "reason": f"请求微信失败: {e}"}

    if d.get("errcode"):
        logging.warning("[wechat] code2session 错误: %s %s", d.get("errcode"), d.get("errmsg"))
        return {"ok": False, "reason": f"微信错误 {d.get('errcode')} {d.get('errmsg')}"}

    openid = d.get("openid")
    if not openid:
        return {"ok": False, "reason": "未返回 openid"}
    return {"ok": True, "openid": openid}
