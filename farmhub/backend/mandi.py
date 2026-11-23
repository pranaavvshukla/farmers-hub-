"""Mandi price + MSP benchmark.

1. If DATA_GOV_API_KEY is set (free key from data.gov.in → My Account), today's
   AGMARKNET prices (Govt of India, "Current daily price of various commodities from
   various markets (Mandi)") are fetched live and cached for 6 hours.
2. Otherwise, or when the API is slow, rate-limited or down, mandi_rates.json is used,
   so the app always works offline.
All prices are rupees per quintal; helpers convert to the farmer's own unit.
"""
import json
import os
import time
import urllib.parse
import urllib.request

from crops import CROPS, crop_key, crop_label

_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_DIR, "mandi_rates.json"), encoding="utf-8") as fh:
    CACHE = json.load(fh)

AGMARKNET_RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070"
API_URL = f"https://api.data.gov.in/resource/{AGMARKNET_RESOURCE}"
LIVE_TTL = 6 * 3600
_live_cache = {}  # (state, district, commodity) -> (timestamp, records or None)
_last_error = {"message": None}

# How many quintals one unit is (None = cannot compare).
UNIT_IN_QUINTAL = {"kg": 0.01, "quintal": 1.0, "ton": 10.0}
LOW_THRESHOLD = -15.0  # % below mandi price that triggers the warning

# AGMARKNET commodity names differ from ours for a few crops.
AGMARK_NAME = {"rice": "Paddy(Dhan)(Common)", "tur": "Arhar (Tur/Red Gram)(Whole)", "chana": "Bengal Gram(Gram)(Whole)",
               "chilli": "Green Chilli", "soybean": "Soyabean", "grapes": "Grapes", "brinjal": "Brinjal"}


def live_enabled():
    return bool(os.getenv("DATA_GOV_API_KEY", "").strip())


def live_status():
    return {"enabled": live_enabled(), "last_error": _last_error["message"]}


def _query(state=None, district=None, commodity=None, limit=100):
    """Records from the live AGMARKNET API, or None (no key / error / rate limit)."""
    key = os.getenv("DATA_GOV_API_KEY", "").strip()
    if not key:
        return None
    ck = ((state or "").lower(), (district or "").lower(), (commodity or "").lower())
    hit = _live_cache.get(ck)
    if hit and time.time() - hit[0] < LIVE_TTL:
        return hit[1]
    params = {"api-key": key, "format": "json", "limit": str(limit)}
    if state:
        params["filters[state.keyword]"] = state
    if district:
        params["filters[district]"] = district
    if commodity:
        params["filters[commodity]"] = commodity
    records = None
    try:
        req = urllib.request.Request(f"{API_URL}?{urllib.parse.urlencode(params)}", headers={"User-Agent": "FarmHub/1.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            body = json.load(resp)
        if body.get("error"):
            _last_error["message"] = str(body["error"])
        else:
            records = body.get("records") or []
            _last_error["message"] = None
    except Exception as exc:  # network down, timeout, bad key
        _last_error["message"] = f"{type(exc).__name__}"
    _live_cache[ck] = (time.time(), records)
    return records


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _summarise(records):
    prices = [p for p in (_num(r.get("modal_price")) for r in records) if p]
    if not prices:
        return None
    r0 = records[0]
    mins = [p for p in (_num(r.get("min_price")) for r in records) if p]
    maxs = [p for p in (_num(r.get("max_price")) for r in records) if p]
    return {"market": r0.get("market") or r0.get("district"), "state": r0.get("state"),
            "modal": round(sum(prices) / len(prices)), "min": min(mins) if mins else None,
            "max": max(maxs) if maxs else None, "as_of": r0.get("arrival_date")}


def benchmark(crop_name, district=None, state=None):
    """Mandi + MSP benchmark for a crop, or None if FarmHub has no data for it."""
    key = crop_key(crop_name)
    info = CACHE["crops"].get(key)
    label = crop_label(key)

    live = None
    if district and live_enabled():
        recs = _query(state=state, district=district, commodity=AGMARK_NAME.get(key, label))
        live = _summarise(recs) if recs else None

    if live:
        source, market = "live", live
    elif info:
        markets = info["markets"]
        d = (district or "").strip().lower()
        match = next((m for name, m in markets.items() if name.lower() == d), None)
        if match:
            market, source = dict(match, district=district), "cache"
        else:
            same_state = [m for m in markets.values() if state and m["state"].lower() == state.strip().lower()]
            if same_state:
                avg = round(sum(m["modal"] for m in same_state) / len(same_state))
                market = {"market": f"{same_state[0]['state']} average", "state": same_state[0]["state"],
                          "modal": avg, "min": min(m["min"] for m in same_state),
                          "max": max(m["max"] for m in same_state)}
            else:
                market = {"market": "All-India average", "state": None, "modal": info["national"],
                          "min": None, "max": None}
            source = "cache"
    else:
        return None

    return {
        "crop": label,
        "crop_key": key,
        "district": district,
        "market": market.get("market"),
        "state": market.get("state"),
        "modal_per_quintal": market["modal"],
        "min_per_quintal": market.get("min"),
        "max_per_quintal": market.get("max"),
        "msp_per_quintal": info["msp"] if info else None,
        "msp_note": info["msp_note"] if info else None,
        "source": source,
        "as_of": market.get("as_of") or CACHE["as_of"],
    }


def district_board(state, district):
    """All crops with a price for a district: live AGMARKNET rows when a key is set,
    otherwise the cached district markets (then the state average)."""
    rows = []
    if live_enabled():
        recs = _query(state=state, district=district, limit=200) or []
        by_crop = {}
        for r in recs:
            by_crop.setdefault(r.get("commodity") or "?", []).append(r)
        for commodity, items in by_crop.items():
            s = _summarise(items)
            if not s:
                continue
            key = crop_key(commodity)
            info = CACHE["crops"].get(key)
            rows.append({"crop": commodity, "crop_key": key, "market": s["market"], "modal_per_quintal": s["modal"],
                         "min_per_quintal": s["min"], "max_per_quintal": s["max"],
                         "msp_per_quintal": info["msp"] if info else None, "source": "live", "as_of": s["as_of"]})
    if not rows:
        d = (district or "").strip().lower()
        st = (state or "").strip().lower()
        for key, info in CACHE["crops"].items():
            exact = next((m for name, m in info["markets"].items() if name.lower() == d), None)
            in_state = [m for m in info["markets"].values() if m["state"].lower() == st]
            if exact:
                m, scope = exact, "district"
            elif in_state:
                m = {"market": f"{in_state[0]['state']} average", "modal": round(sum(x["modal"] for x in in_state) / len(in_state)),
                     "min": min(x["min"] for x in in_state), "max": max(x["max"] for x in in_state)}
                scope = "state"
            else:
                continue
            rows.append({"crop": crop_label(key), "crop_key": key, "market": m["market"], "scope": scope,
                         "modal_per_quintal": m["modal"], "min_per_quintal": m.get("min"), "max_per_quintal": m.get("max"),
                         "msp_per_quintal": info["msp"], "msp_note": info["msp_note"], "source": "cache",
                         "as_of": CACHE["as_of"]})
        rows.sort(key=lambda r: (r.get("scope") != "district", r["crop"]))
    return rows


def compare(bench, price, unit):
    """How a farmer's asking price compares with the mandi rate."""
    factor = UNIT_IN_QUINTAL.get(str(unit or "kg").lower())
    if not bench or factor is None or not price:
        return None
    per_q = float(price) / factor
    diff = (per_q - bench["modal_per_quintal"]) / bench["modal_per_quintal"] * 100
    below_msp = bool(bench["msp_per_quintal"] and per_q < bench["msp_per_quintal"])
    verdict = "low" if diff < LOW_THRESHOLD or below_msp else ("fair" if diff < 0 else "good")
    return {
        "your_per_quintal": round(per_q, 2),
        "mandi_per_unit": round(bench["modal_per_quintal"] * factor, 2),
        "msp_per_unit": round(bench["msp_per_quintal"] * factor, 2) if bench["msp_per_quintal"] else None,
        "diff_percent": round(diff, 1),
        "below_msp": below_msp,
        "verdict": verdict,
    }


__all__ = ["CROPS", "UNIT_IN_QUINTAL", "benchmark", "compare", "district_board", "live_status"]
