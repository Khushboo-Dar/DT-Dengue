import aiosqlite
from datetime import datetime, timedelta
from config import config


async def init_db() -> None:
    async with aiosqlite.connect(config.DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS patient_outcomes (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id      TEXT    NOT NULL,
                confirmed_severity INTEGER NOT NULL CHECK(confirmed_severity IN (0,1,2)),
                outcome_date    TEXT    NOT NULL,
                created_at      TEXT    NOT NULL
            )
        """)
        await db.commit()


async def insert_outcome(patient_id: str, confirmed_severity: int, outcome_date: str) -> None:
    async with aiosqlite.connect(config.DB_PATH) as db:
        await db.execute(
            """INSERT INTO patient_outcomes
               (patient_id, confirmed_severity, outcome_date, created_at)
               VALUES (?, ?, ?, ?)""",
            (patient_id, confirmed_severity, outcome_date, datetime.utcnow().isoformat()),
        )
        await db.commit()


async def get_outcomes_since(days: int) -> list[dict]:
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    async with aiosqlite.connect(config.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM patient_outcomes WHERE created_at >= ? ORDER BY created_at DESC",
            (cutoff,),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_outcomes_for_patient(patient_id: str) -> list[dict]:
    async with aiosqlite.connect(config.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM patient_outcomes WHERE patient_id = ? ORDER BY outcome_date DESC",
            (patient_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_all_outcomes() -> list[dict]:
    async with aiosqlite.connect(config.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM patient_outcomes ORDER BY created_at DESC"
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def count_severe_today() -> int:
    today = datetime.utcnow().date().isoformat()
    async with aiosqlite.connect(config.DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM patient_outcomes WHERE confirmed_severity = 2 AND outcome_date = ?",
            (today,),
        ) as cur:
            result = await cur.fetchone()
    return result[0] if result else 0
