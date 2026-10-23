"""
Database Setup
Async SQLAlchemy engine and session for SQLite.
"""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},  # Required for SQLite
)

# Session factory
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


async def init_db():
    """Create all database tables and apply lightweight schema migrations."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        def _migrate_columns(sync_conn):
            # Migrate reports table
            cols = {row[1] for row in sync_conn.exec_driver_sql("PRAGMA table_info(reports)").fetchall()}
            new_columns = [
                ("patient_id", "TEXT"),
                ("patient_name", "TEXT"),
                ("patient_age", "INTEGER"),
                ("patient_gender", "TEXT"),
                ("clinical_indication", "TEXT"),
                ("urgency_level", "TEXT DEFAULT 'normal'"),
                ("status", "TEXT DEFAULT 'preliminary'"),
                ("radiologist_notes", "TEXT"),
                ("verified_by", "TEXT"),
                ("verified_at", "DATETIME"),
            ]
            for col_name, col_type in new_columns:
                if col_name not in cols:
                    sync_conn.exec_driver_sql(f"ALTER TABLE reports ADD COLUMN {col_name} {col_type}")

            # Migrate users table
            user_cols = {row[1] for row in sync_conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()}
            user_new_columns = [
                ("hospital_name", "TEXT"),
                ("department", "TEXT"),
                ("license_number", "TEXT"),
                ("signature_title", "TEXT"),
            ]
            for col_name, col_type in user_new_columns:
                if col_name not in user_cols:
                    sync_conn.exec_driver_sql(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")

        await conn.run_sync(_migrate_columns)


async def get_db() -> AsyncSession:
    """Dependency: yields a database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
