"""
Currency helpers for the multi-currency feature.

Uses the free, no-API-key endpoint https://open.er-api.com/v6/latest/USD which
returns rates relative to USD. Cross rates are derived as rate(A->B) = usd[B] / usd[A].

Rates are cached in-memory with a TTL so we don't hit the network on every request.
All monetary math uses Decimal to avoid float drift.
"""

from __future__ import annotations

import os
import time
import threading
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Optional

import requests

# Supported currencies (code -> display name). Kept intentionally small and common.
SUPPORTED_CURRENCIES: Dict[str, str] = {
    "USD": "US Dollar",
    "EUR": "Euro",
    "GBP": "British Pound",
    "INR": "Indian Rupee",
    "JPY": "Japanese Yen",
    "CAD": "Canadian Dollar",
    "AUD": "Australian Dollar",
    "CHF": "Swiss Franc",
    "CNY": "Chinese Yuan",
    "SGD": "Singapore Dollar",
    "AED": "UAE Dirham",
    "NZD": "New Zealand Dollar",
    "ZAR": "South African Rand",
    "BRL": "Brazilian Real",
    "MXN": "Mexican Peso",
    "SEK": "Swedish Krona",
    "NOK": "Norwegian Krone",
    "HKD": "Hong Kong Dollar",
}

DEFAULT_CURRENCY = "USD"
_RATE_ENDPOINT = "https://open.er-api.com/v6/latest/USD"
_CACHE_TTL_SECONDS = int(os.getenv("FX_CACHE_TTL_SECONDS", "3600"))
_REQUEST_TIMEOUT = float(os.getenv("FX_REQUEST_TIMEOUT_SECONDS", "6"))

# Cache of USD-based rates: {"USD": 1.0, "EUR": 0.92, ...}
_rate_cache: Dict[str, Decimal] = {}
_rate_cache_fetched_at: float = 0.0
_cache_lock = threading.Lock()


class CurrencyError(Exception):
    """Raised when a rate cannot be resolved."""


def is_supported(code: Optional[str]) -> bool:
    return bool(code) and code.upper() in SUPPORTED_CURRENCIES


def normalize(code: Optional[str], fallback: str = DEFAULT_CURRENCY) -> str:
    if code and code.upper() in SUPPORTED_CURRENCIES:
        return code.upper()
    return fallback


def _fetch_usd_rates() -> Dict[str, Decimal]:
    """Fetch fresh USD-based rates from the provider."""
    resp = requests.get(_RATE_ENDPOINT, timeout=_REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    if data.get("result") != "success" or "rates" not in data:
        raise CurrencyError("Rate provider returned an unexpected response")
    rates: Dict[str, Decimal] = {}
    for code, value in data["rates"].items():
        try:
            rates[code.upper()] = Decimal(str(value))
        except Exception:
            continue
    if "USD" not in rates:
        rates["USD"] = Decimal("1")
    return rates


def _get_usd_rates(force: bool = False) -> Dict[str, Decimal]:
    """Return cached USD-based rates, refreshing if stale."""
    global _rate_cache, _rate_cache_fetched_at
    now = time.time()
    with _cache_lock:
        fresh = _rate_cache and (now - _rate_cache_fetched_at) < _CACHE_TTL_SECONDS
        if fresh and not force:
            return _rate_cache
        try:
            rates = _fetch_usd_rates()
            _rate_cache = rates
            _rate_cache_fetched_at = now
            return rates
        except Exception as exc:
            # Fall back to the last good cache if we have one; otherwise surface the error.
            if _rate_cache:
                return _rate_cache
            raise CurrencyError(f"Unable to fetch exchange rates: {exc}") from exc


def get_rate(from_currency: str, to_currency: str) -> Decimal:
    """
    Return the exchange rate to convert 1 unit of `from_currency` into `to_currency`.
    rate(A->B) = usd[B] / usd[A].
    """
    src = normalize(from_currency)
    dst = normalize(to_currency)
    if src == dst:
        return Decimal("1")
    rates = _get_usd_rates()
    if src not in rates or dst not in rates:
        raise CurrencyError(f"Unsupported currency in conversion {src}->{dst}")
    rate = rates[dst] / rates[src]
    return rate.quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)


def convert(amount: Decimal, from_currency: str, to_currency: str) -> Decimal:
    """Convert an amount and round to 2 decimal places (money)."""
    rate = get_rate(from_currency, to_currency)
    return (Decimal(amount) * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def quantize_money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def quantize_rate(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
