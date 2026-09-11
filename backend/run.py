"""本地启动：在 backend 目录执行  uvicorn app.main:app --reload --port 8000"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
