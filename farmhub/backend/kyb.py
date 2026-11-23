"""Know-Your-Business checks for buyers, done locally (no paid KYC API).

GSTIN: 15 characters = 2-digit state code + 10-char PAN + entity number + 'Z' + check
character. The check character uses the official GSTN mod-36 algorithm, so a typo or
a made-up number is caught without calling any government server.
FSSAI: 14-digit licence / registration number.
"""
import re

GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
FSSAI_RE = re.compile(r"^[12][0-9]{13}$")

# GST state codes for the states FarmHub users come from (codes are official).
GST_STATE_CODES = {
    "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
    "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "27": "Maharashtra",
    "29": "Karnataka", "30": "Goa", "32": "Kerala", "33": "Tamil Nadu", "36": "Telangana",
    "37": "Andhra Pradesh",
}
STATE_ALIASES = {"kashmir": "Jammu and Kashmir", "j&k": "Jammu and Kashmir", "up": "Uttar Pradesh",
                 "mp": "Madhya Pradesh", "orissa": "Odisha", "new delhi": "Delhi"}

# Who may buy on FarmHub. Commission agents and traders are the middlemen we remove.
BUSINESS_TYPES = ["Food Processor", "Hotel/HoReCa", "Retail Chain", "RWA Group", "Individual"]
BLOCKED_TYPES = ["Commission Agent / Arhatiya", "Trader / Middleman"]
NEEDS_GST = {"Food Processor", "Hotel/HoReCa", "Retail Chain"}
NEEDS_FSSAI = {"Food Processor", "Hotel/HoReCa", "Retail Chain"}


def gstin_check_char(first14):
    total = 0
    for i, ch in enumerate(first14):
        product = GST_CHARS.index(ch) * (2 if i % 2 else 1)
        total += product // 36 + product % 36
    return GST_CHARS[(36 - total % 36) % 36]


def make_gstin(state_code, pan, entity="1"):
    """Build a GSTIN with a correct check character (used for demo data)."""
    body = f"{state_code}{pan}{entity}Z"
    return body + gstin_check_char(body)


def _canon_state(name):
    n = (name or "").strip().lower()
    n = STATE_ALIASES.get(n, n)
    for s in GST_STATE_CODES.values():
        if s.lower() == str(n).lower():
            return s
    return None


def validate_gstin(gstin, state=None):
    """Return (clean_gstin, error). error is None when valid."""
    g = re.sub(r"\s+", "", str(gstin or "")).upper()
    if not GSTIN_RE.match(g):
        return g, "GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5."
    if g[:2] not in GST_STATE_CODES and g[:2] not in ("97", "99"):
        return g, f"GSTIN state code {g[:2]} is not valid."
    if gstin_check_char(g[:14]) != g[14]:
        return g, "GSTIN check digit does not match. Please re-check the number."
    want = _canon_state(state)
    if want and GST_STATE_CODES.get(g[:2]) not in (None, want):
        return g, f"GSTIN is registered in {GST_STATE_CODES[g[:2]]}, but your profile says {want}."
    return g, None


def validate_fssai(number):
    f = re.sub(r"\s+", "", str(number or ""))
    if not FSSAI_RE.match(f):
        return f, "FSSAI number must be 14 digits starting with 1 or 2."
    return f, None


def verify_business(business_type, gstin, fssai, state=None):
    """Full KYB rule check. Returns (result dict, error message or None)."""
    bt = str(business_type or "").strip()
    if bt in BLOCKED_TYPES or re.search(r"commission|arhat|agent|middle ?man|trader", bt, re.I):
        return None, "Commission agents and traders cannot buy on FarmHub. It is a direct farmer-to-buyer market."
    if bt not in BUSINESS_TYPES:
        return None, f"Business type must be one of: {', '.join(BUSINESS_TYPES)}."
    result = {"business_type": bt, "gstin": None, "fssai_no": None}
    if bt in NEEDS_GST or gstin:
        g, err = validate_gstin(gstin, state)
        if err:
            return None, err
        result["gstin"] = g
    if bt in NEEDS_FSSAI or fssai:
        f, err = validate_fssai(fssai)
        if err:
            return None, err
        result["fssai_no"] = f
    return result, None


def mask(value, keep=4):
    if not value:
        return None
    return "•" * max(0, len(value) - keep) + value[-keep:]
