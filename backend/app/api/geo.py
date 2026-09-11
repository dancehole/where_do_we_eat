import logging
from typing import Optional

import requests
from fastapi import APIRouter, Request

from ..core.config import settings

router = APIRouter(prefix="/api/geo", tags=["geo"])

AMAP_IP_URL = "https://restapi.amap.com/v3/ip"
AMAP_CONVERT_URL = "https://restapi.amap.com/v3/assistant/coordinate/convert"


def _amap_ip(key: str, ip: Optional[str] = None):
    """高德 IP 定位（城市级，GCJ-02）。可传入要解析的 ip；不传则解析调用方出口 IP。返回 {lat,lng,city} 或 None。"""
    params = {"key": key}
    if ip:
        params["ip"] = ip
    try:
        r = requests.get(AMAP_IP_URL, params=params, timeout=8)
        data = r.json()
    except Exception as e:
        logging.warning("[geo] 高德 /v3/ip 请求失败: %s", e)
        return None
    if data.get("status") != "1":
        logging.warning("[geo] 高德 IP 定位错误: %s %s", data.get("info"), data.get("infocode"))
        return None
    rect = data.get("rectangle") or ""
    coords = [c for c in rect.split(";") if c]
    lats, lngs = [], []
    for c in coords:
        parts = c.split(",")
        if len(parts) == 2:
            try:
                lngs.append(float(parts[0]))
                lats.append(float(parts[1]))
            except ValueError:
                pass
    if lats and lngs:
        return {
            "lat": round(sum(lats) / len(lats), 6),
            "lng": round(sum(lngs) / len(lngs), 6),
            "city": (data.get("city") or data.get("province") or "").strip(),
        }
    # 高德能识别这个 IP 但给不出矩形（极少），用城市名兜底
    city = (data.get("city") or data.get("province") or "").strip()
    if city:
        return {"lat": None, "lng": None, "city": city}
    return None


def _public_ip(ip: Optional[str] = None):
    """公共 IP 服务兜底（WGS-84）。可指定要解析的 ip。返回 {lat,lng,city} 或 None。"""
    if ip:
        urls = (f"https://ipwho.is/{ip}", f"https://ipinfo.io/{ip}/json")
    else:
        # ipapi.co 近期会 403，故不再列为首选
        urls = ("https://api.ip.sb/geoip/", "https://ipwho.is/", "https://ipinfo.io/json")
    for url in urls:
        try:
            r = requests.get(url, timeout=8)
            d = r.json()
        except Exception:
            continue
        lat = lng = None
        if d.get("latitude") is not None and d.get("longitude") is not None:
            try:
                lat, lng = float(d["latitude"]), float(d["longitude"])
            except (ValueError, TypeError):
                lat = lng = None
        elif d.get("loc"):
            try:
                a, b = str(d["loc"]).split(",")
                lat, lng = float(a), float(b)
            except (ValueError, TypeError):
                lat = lng = None
        if lat is not None and lng is not None and not (lat == 0 and lng == 0):
            return {"lat": lat, "lng": lng, "city": (d.get("city") or "").strip()}
    return None


def _to_gcj02(key: str, lat: float, lng: float):
    """WGS-84 -> GCJ-02（高德坐标）。无 key 或失败则原样返回。"""
    if not key:
        return lat, lng
    try:
        r = requests.get(
            AMAP_CONVERT_URL,
            params={"key": key, "locations": f"{lng},{lat}", "coordsys": "gps"},
            timeout=8,
        )
        d = r.json()
        if d.get("status") == "1" and d.get("locations"):
            ln, la = str(d["locations"]).split(",")
            return float(la), float(ln)
    except Exception as e:
        logging.warning("[geo] 坐标转换失败: %s", e)
    return lat, lng


@router.get("/ip")
def ip_locate(request: Request, ip: Optional[str] = None):
    """
    服务端 IP 定位兜底（城市级）。多级：
      ① 高德 /v3/ip（GCJ-02，最贴近高德地图）；
      ② 公共 IP 服务（WGS-84）再转 GCJ-02；
    可选 ?ip=x.x.x.x：前端把「本机公网 IP」传进来，服务端按【客户端真实出口 IP】定位
    （否则服务端只能看到调用方出口 IP，即服务器所在城市）。
    若任何服务都解析不到城市，返回 ok:False 让前端继续用更粗的兜底（公共 IP / 手动选择）。
    注意：IP 定位天生只有城市级精度，无法精确到楼。要精确自动定位需 HTTPS（浏览器 GPS）。
    """
    key = settings.AMAP_WEB_KEY
    if not key:
        return {"ok": False, "reason": "未配置 AMAP_WEB_KEY"}

    # ① 高德 IP 定位
    #    ⚠️ 实测高德 /v3/ip 会【忽略 ip 参数】（传任意 IP 仍按调用方出口 IP 返回），
    #    因此只有不指定 ip 时才用高德；指定 ip 时交给下面能按 IP 解析的公共 IP 服务。
    amap = None if ip else _amap_ip(key)
    if amap and amap.get("lat") is not None:
        return {
            "ok": True,
            "province": amap.get("city", ""),
            "city": amap["city"],
            "lat": amap["lat"],
            "lng": amap["lng"],
            "addr": amap["city"] or "网络定位",
            "source": "amap",
        }

    # ② 公共 IP 服务（WGS-84）→ GCJ-02
    pub = _public_ip(ip)
    if pub:
        glat, glng = _to_gcj02(key, pub["lat"], pub["lng"])
        return {
            "ok": True,
            "city": pub["city"],
            "lat": glat,
            "lng": glng,
            "addr": pub["city"] or "网络定位",
            "source": "public",
        }

    return {"ok": False, "reason": "当前网络出口 IP 无法解析到城市，请改用「手动选择」精确定位"}
