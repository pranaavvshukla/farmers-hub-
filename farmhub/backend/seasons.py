"""Indian crop seasons (Kharif, Rabi, Zaid) used for seasonal filters,
the seasonal-crops screen and the season split in the finance dashboard."""
import re
from datetime import date

ALL_YEAR = "All year"

SEASONS = [
    {
        "key": "Kharif",
        "label": "Kharif (monsoon)",
        "months": [6, 7, 8, 9, 10],
        "sowing": "June - July",
        "harvest": "September - October",
        "crops": ["Rice", "Maize", "Cotton", "Soybean", "Groundnut", "Bajra", "Jowar",
                  "Tur (Arhar)", "Urad", "Sugarcane", "Okra", "Apple"],
    },
    {
        "key": "Rabi",
        "label": "Rabi (winter)",
        "months": [11, 12, 1, 2],
        "sowing": "October - December",
        "harvest": "March - April",
        "crops": ["Wheat", "Barley", "Gram (Chana)", "Mustard", "Peas", "Masoor", "Potato",
                  "Onion", "Garlic", "Tomato", "Cauliflower", "Grapes", "Orange"],
    },
    {
        "key": "Zaid",
        "label": "Zaid (summer)",
        "months": [3, 4, 5],
        "sowing": "March - April",
        "harvest": "May - June",
        "crops": ["Watermelon", "Muskmelon", "Cucumber", "Bitter gourd", "Bottle gourd",
                  "Pumpkin", "Moong", "Mango", "Fodder"],
    },
]

SEASON_KEYS = [s["key"] for s in SEASONS] + [ALL_YEAR]

# Keyword -> season, checked in this order (first match wins).
_KEYWORDS = [
    ("Zaid", ["watermelon", "muskmelon", "melon", "cucumber", "gourd", "pumpkin", "mango",
              "fodder", "litchi", "moong"]),
    ("Kharif", ["rice", "paddy", "maize", "corn", "cotton", "soybean", "soya", "groundnut",
                "bajra", "jowar", "tur", "arhar", "urad", "sugarcane", "okra", "bhindi", "apple"]),
    ("Rabi", ["wheat", "barley", "gram", "chana", "mustard", "peas", "masoor", "lentil",
              "potato", "onion", "garlic", "tomato", "cauliflower", "cabbage", "carrot",
              "spinach", "radish", "grape", "orange"]),
]


def current_season(today=None):
    month = (today or date.today()).month
    for s in SEASONS:
        if month in s["months"]:
            return s["key"]
    return ALL_YEAR


def guess_season(name):
    """Best guess of the season for a crop name, e.g. 'Green Grapes' -> 'Rabi'."""
    text = (name or "").lower()
    for season, words in _KEYWORDS:
        if any(re.search(r"\b" + w, text) for w in words):
            return season
    return ALL_YEAR


def normalize_season(value):
    """Return the canonical season key for user input, or None if it is not one."""
    if value is None:
        return None
    v = str(value).strip().lower()
    for key in SEASON_KEYS:
        if v == key.lower():
            return key
    return None
