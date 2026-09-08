from psycopg import AsyncConnection

from app.config import Settings


async def check_database(settings: Settings) -> None:
    async with await AsyncConnection.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        dbname=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password.get_secret_value(),
        connect_timeout=3,
        options="-c statement_timeout=3000",
    ) as connection:
        await connection.execute("SELECT 1")
