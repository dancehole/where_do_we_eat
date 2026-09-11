"""建表 / 补列脚本：在 backend 目录执行  python init_db.py

- 新表：create_all 直接建
- 已存在的表新增字段：create_all 不会自动加列，这里做**幂等** ALTER（缺哪列补哪列）
"""
from sqlalchemy import inspect, text

from app.core.database import engine, Base
from app import models  # noqa: F401  确保模型注册到 Base.metadata


# 老库需要补齐的列：表名 -> {列名: DDL 片段}
EXTRA_COLUMNS = {
    "preferences": {
        "cuisine_include": "JSON NULL",
        "cuisine_exclude": "JSON NULL",
        "area_include": "JSON NULL",
        "price_min": "DECIMAL(10,2) NULL",
        "price_max": "DECIMAL(10,2) NULL",
        "radius": "INT NULL",
        "note": "TEXT NULL",
        "updated_at": "DATETIME NULL",
    },
}


def ensure_columns() -> None:
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, cols in EXTRA_COLUMNS.items():
            if table not in existing_tables:
                continue
            have = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in cols.items():
                if name in have:
                    continue
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                print(f"  + {table}.{name}")


def main():
    Base.metadata.create_all(bind=engine)
    print("数据库表已创建（若已存在则跳过）。")
    ensure_columns()
    print("字段已补齐（若已存在则跳过）。")


if __name__ == "__main__":
    main()
