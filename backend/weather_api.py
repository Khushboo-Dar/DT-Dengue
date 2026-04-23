"""
Real weather data integration using Open-Meteo API (free, no API key).
Fetches temperature and rainfall for the past 6 days for a given location.
Default location: Kuala Lumpur, Malaysia (dengue-endemic region).
"""
import httpx
from datetime import datetime, timedelta

# Default: Kuala Lumpur, Malaysia
DEFAULT_LAT = 3.1390
DEFAULT_LON = 101.6869

_cache: dict = {}
_cache_ts: float = 0


async def get_weather_lags(
    lat: float = DEFAULT_LAT,
    lon: float = DEFAULT_LON,
) -> dict:
    """
    Fetch 6-day temperature and rainfall history from Open-Meteo.
    Returns dict with Temp_lag1..6 and Rain_lag1..6.
    Caches results for 1 hour to avoid excessive API calls.
    """
    import time
    global _cache, _cache_ts

    cache_key = f"{lat:.2f},{lon:.2f}"
    now = time.time()

    if cache_key in _cache and (now - _cache_ts) < 3600:
        return _cache[cache_key]

    today = datetime.utcnow().date()
    start = today - timedelta(days=6)

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "temperature_2m_mean,precipitation_sum",
        "start_date": start.isoformat(),
        "end_date": (today - timedelta(days=1)).isoformat(),
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        temps = data.get("daily", {}).get("temperature_2m_mean", [])
        rains = data.get("daily", {}).get("precipitation_sum", [])

        # Reverse: lag1 = most recent, lag6 = oldest
        temps = list(reversed(temps))
        rains = list(reversed(rains))

        result = {}
        for i in range(1, 7):
            result[f"Temp_lag{i}"] = float(temps[i - 1]) if i <= len(temps) and temps[i - 1] is not None else 37.0
            result[f"Rain_lag{i}"] = float(rains[i - 1]) if i <= len(rains) and rains[i - 1] is not None else 50.0

        _cache[cache_key] = result
        _cache_ts = now
        return result

    except Exception:
        # Fallback to defaults if API fails
        return {
            **{f"Temp_lag{i}": 37.0 for i in range(1, 7)},
            **{f"Rain_lag{i}": 50.0 for i in range(1, 7)},
        }
