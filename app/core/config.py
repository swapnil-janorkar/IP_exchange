"""
Application settings, loaded once from environment variables / .env.

Every module (auth, patents, search, ...) imports `settings` from here
instead of reading os.environ directly — keeps config in one place and
makes it trivial to override in tests.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- App ---
    environment: str = "development"
    debug: bool = True

    # --- Database ---
    database_url: str

    # --- Auth (Phase 2) ---
    jwt_secret_key: str = "dev-only-placeholder-change-before-auth-phase"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # --- AI providers (Phase 5) ---
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Cached so we parse the environment only once per process."""
    return Settings()


settings = get_settings()
