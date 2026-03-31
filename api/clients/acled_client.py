"""
ACLED (Armed Conflict Location & Event Data) API client.

Fetches conflict event data from ACLED using OAuth token authentication.
Stores event counts and fatality summaries in macro_series (source='ACLED').

Credentials are read from environment variables:
- ACLED_USERNAME: registered email
- ACLED_PASSWORD: account password

These are stored as Fly.io secrets and never logged or hardcoded.

API docs: https://acleddata.com/resources/general/
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

import config

logger = logging.getLogger(__name__)

TOKEN_URL = "https://acleddata.com/oauth/token"
API_BASE = "https://acleddata.com/api/acled/read"
TIMEOUT = httpx.Timeout(30.0, connect=15.0)

# Default regions of interest (ACLED region codes)
DEFAULT_REGIONS: dict[str, int] = {
    "middle_east": 11,
    "south_asia": 9,
    "east_asia": 4,
    "southeast_asia": 13,
}

# Region code to human-readable name
_REGION_NAMES: dict[int, str] = {
    11: "Middle East",
    9: "South Asia",
    4: "East Asia",
    13: "Southeast Asia",
}


class ACLEDClient:
    """OAuth-authenticated client for the ACLED conflict data API."""

    def __init__(self) -> None:
        """Initialise credentials from environment. Never stores plaintext."""
        self._username: str = config.ACLED_USERNAME
        self._password: str = config.ACLED_PASSWORD
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._token_expiry: datetime | None = None

    @property
    def is_configured(self) -> bool:
        """Check whether ACLED credentials are available."""
        return bool(self._username and self._password)

    async def _authenticate(self, client: httpx.AsyncClient) -> None:
        """Request a new access token using username/password grant.

        Raises on failure so callers can handle gracefully.
        """
        resp = await client.post(
            TOKEN_URL,
            data={
                "username": self._username,
                "password": self._password,
                "grant_type": "password",
                "client_id": "acled",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        data = resp.json()

        self._access_token = data["access_token"]
        self._refresh_token = data.get("refresh_token")
        expires_in = int(data.get("expires_in", 86400))
        self._token_expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        logger.info("ACLED: authenticated successfully (expires in %ds)", expires_in)

    async def _refresh_access_token(self, client: httpx.AsyncClient) -> None:
        """Refresh the access token using the refresh token.

        Falls back to full re-authentication if the refresh fails.
        """
        if not self._refresh_token:
            await self._authenticate(client)
            return

        try:
            resp = await client.post(
                TOKEN_URL,
                data={
                    "refresh_token": self._refresh_token,
                    "grant_type": "refresh_token",
                    "client_id": "acled",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            data = resp.json()

            self._access_token = data["access_token"]
            self._refresh_token = data.get("refresh_token", self._refresh_token)
            expires_in = int(data.get("expires_in", 86400))
            self._token_expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            logger.info("ACLED: token refreshed (expires in %ds)", expires_in)
        except Exception as exc:
            logger.warning("ACLED: token refresh failed (%s), re-authenticating", exc)
            await self._authenticate(client)

    async def _get_valid_token(self, client: httpx.AsyncClient) -> str:
        """Return a valid access token, authenticating or refreshing as needed.

        Applies a 5-minute buffer before expiry to avoid race conditions.

        Args:
            client: httpx async client for token requests.

        Returns:
            Valid access token string.
        """
        now = datetime.now(timezone.utc)
        buffer = timedelta(minutes=5)

        if self._access_token and self._token_expiry and (self._token_expiry - buffer) > now:
            return self._access_token

        if self._refresh_token:
            await self._refresh_access_token(client)
        else:
            await self._authenticate(client)

        if not self._access_token:
            raise RuntimeError("ACLED authentication failed: no token obtained")

        return self._access_token

    async def fetch_conflict_events(
        self,
        regions: list[int] | None = None,
        days_back: int = 30,
    ) -> list[dict[str, Any]]:
        """Fetch conflict events from ACLED for the specified regions and time window.

        Args:
            regions: List of ACLED region codes. Defaults to Middle East,
                     South Asia, East Asia, Southeast Asia.
            days_back: Number of days of history to fetch.

        Returns:
            List of event dicts from ACLED API.
        """
        if not self.is_configured:
            logger.debug("ACLED: credentials not configured, skipping")
            return []

        if regions is None:
            regions = list(DEFAULT_REGIONS.values())

        now = datetime.now(timezone.utc)
        start_date = (now - timedelta(days=days_back)).strftime("%Y-%m-%d")
        end_date = now.strftime("%Y-%m-%d")

        all_events: list[dict[str, Any]] = []

        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            try:
                token = await self._get_valid_token(client)
            except Exception as exc:
                logger.error("ACLED: authentication failed: %s", exc)
                return []

            for region_code in regions:
                try:
                    resp = await client.get(
                        API_BASE,
                        params={
                            "limit": 500,
                            "event_date": f"{start_date}|{end_date}",
                            "event_date_where": "BETWEEN",
                            "region": region_code,
                        },
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    if resp.status_code == 401:
                        # Token may have been invalidated; try once more
                        token = await self._get_valid_token(client)
                        resp = await client.get(
                            API_BASE,
                            params={
                                "limit": 500,
                                "event_date": f"{start_date}|{end_date}",
                                "event_date_where": "BETWEEN",
                                "region": region_code,
                            },
                            headers={"Authorization": f"Bearer {token}"},
                        )
                    resp.raise_for_status()
                    data = resp.json()
                    events = data.get("data", [])
                    all_events.extend(events)
                    logger.info(
                        "ACLED: fetched %d events for region %d (%s)",
                        len(events), region_code,
                        _REGION_NAMES.get(region_code, str(region_code)),
                    )
                except Exception as exc:
                    logger.error(
                        "ACLED: fetch failed for region %d: %s",
                        region_code, exc,
                    )

                await asyncio.sleep(0.5)

        return all_events

    async def fetch_and_store(self, db_pool: Any) -> int:
        """Fetch conflict events and store summaries in macro_series.

        Stores two types of series per region:
        1. Event type counts: conflict_{region}_{event_type}
        2. Total event count: conflict_event_count_{region}

        Args:
            db_pool: asyncpg connection pool.

        Returns:
            Number of series upserted.
        """
        if not self.is_configured:
            return 0

        events = await self.fetch_conflict_events()
        if not events:
            logger.info("ACLED: no events to store")
            return 0

        # Group events by region
        by_region: dict[int, list[dict]] = {}
        for event in events:
            region = event.get("region", 0)
            try:
                region_code = int(region)
            except (ValueError, TypeError):
                continue
            by_region.setdefault(region_code, []).append(event)

        upserted = 0

        for region_code, region_events in by_region.items():
            region_name = _REGION_NAMES.get(region_code, f"region_{region_code}")

            # Store total event count for this region
            try:
                async with db_pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO macro_series
                            (source, series_id, description, frequency,
                             last_value, last_date, unit, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                        ON CONFLICT (source, series_id) DO UPDATE SET
                            description = EXCLUDED.description,
                            last_value = EXCLUDED.last_value,
                            last_date = EXCLUDED.last_date,
                            unit = EXCLUDED.unit,
                            updated_at = NOW()
                        """,
                        "ACLED",
                        f"conflict_event_count_{region_code}",
                        f"Conflict events (30d) in {region_name}",
                        "D",
                        len(region_events),
                        datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        "count",
                    )
                upserted += 1
            except Exception as exc:
                logger.error(
                    "ACLED: DB upsert failed for event count region %d: %s",
                    region_code, exc,
                )

            # Store fatalities count by event type
            type_fatalities: dict[str, int] = {}
            for event in region_events:
                event_type = (event.get("event_type", "unknown") or "unknown")
                event_type = event_type.lower().replace(" ", "_").replace("/", "_")
                fatalities = 0
                try:
                    fatalities = int(event.get("fatalities", 0) or 0)
                except (ValueError, TypeError):
                    pass
                type_fatalities[event_type] = type_fatalities.get(event_type, 0) + fatalities

            for event_type, fatality_count in type_fatalities.items():
                series_id = f"conflict_{region_code}_{event_type}"
                try:
                    async with db_pool.acquire() as conn:
                        await conn.execute(
                            """
                            INSERT INTO macro_series
                                (source, series_id, description, frequency,
                                 last_value, last_date, unit, updated_at)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                            ON CONFLICT (source, series_id) DO UPDATE SET
                                description = EXCLUDED.description,
                                last_value = EXCLUDED.last_value,
                                last_date = EXCLUDED.last_date,
                                unit = EXCLUDED.unit,
                                updated_at = NOW()
                            """,
                            "ACLED",
                            series_id,
                            f"Fatalities from {event_type} in {region_name} (30d)",
                            "D",
                            fatality_count,
                            datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                            "fatalities",
                        )
                    upserted += 1
                except Exception as exc:
                    logger.error(
                        "ACLED: DB upsert failed for %s: %s",
                        series_id, exc,
                    )

        logger.info(
            "ACLED: stored %d series from %d events across %d regions",
            upserted, len(events), len(by_region),
        )
        return upserted


# Module-level singleton
_client: ACLEDClient | None = None


def _get_client() -> ACLEDClient:
    """Return the singleton ACLEDClient instance."""
    global _client
    if _client is None:
        _client = ACLEDClient()
    return _client


async def refresh_acled(pool: Any) -> int:
    """Top-level refresh function for the scheduler.

    Skips silently if ACLED credentials are not configured.

    Args:
        pool: asyncpg connection pool.

    Returns:
        Number of series upserted, or 0 if skipped.
    """
    client = _get_client()
    if not client.is_configured:
        logger.debug("ACLED: skipping refresh (credentials not configured)")
        return 0

    return await client.fetch_and_store(pool)
