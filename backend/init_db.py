"""建表脚本：在 backend 目录执行  python init_db.py"""
from app.core.database import engine, Base
from app import models  # noqa: F401  确保模型注册到 Base.metadata


def main():
    Base.metadata.create_all(bind=engine)
    print("数据库表已创建（若已存在则跳过）。")


if __name__ == "__main__":
    main()
