"""
AI 平行人生 — 数据库连接
SQLAlchemy + SQLite，零配置，轻量运行
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite 多线程支持
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI 依赖注入：获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化数据库表结构"""
    import models  # noqa: F401 — 确保模型被注册
    Base.metadata.create_all(bind=engine)

    # ─── 兼容旧表：手动补齐缺失的列（SQLite 无 ALTER TABLE ADD COLUMN IF NOT EXISTS）───
    # 每次启动都对比 ORM 模型与实际表结构，缺啥补啥
    try:
        from sqlalchemy import text, inspect
        inspector = inspect(engine)
        with engine.connect() as conn:
            for table_name, table in Base.metadata.tables.items():
                if not inspector.has_table(table_name):
                    continue  # 新表已由 create_all 创建，跳过
                existing = {c["name"] for c in inspector.get_columns(table_name)}
                for col in table.columns:
                    if col.name in existing:
                        continue
                    # 推导 SQLite 列类型
                    col_type = col.type.compile(dialect=engine.dialect)
                    # JSON 类型在 SQLite 中其实就是 TEXT，这里直接用 JSON 让 SQLAlchemy 处理
                    sql_type = "JSON" if "JSON" in col_type.upper() else col_type
                    # 带默认值（NULL 兼容）— 添加为可空，避免 NOT NULL 报错
                    conn.execute(text(
                        f'ALTER TABLE "{table_name}" ADD COLUMN "{col.name}" {sql_type}'
                    ))
                    conn.commit()
                    print(f"[init_db] 已迁移 {table_name}.{col.name} ({sql_type})")
    except Exception as e:
        # 不阻塞启动 — 旧数据字段为空，前端会做降级
        print(f"[init_db] 迁移检查跳过：{e}")