"""Canonical crop names, so "Yellow Onions", "onion" and "कांदा" all mean the same crop.
Used to group village pools and to look up mandi / MSP benchmarks."""
import re

# key: (display name, category, words that identify it in English / Hindi / Marathi)
CROPS = {
    "onion": ("Onion", "Vegetables", ["onion", "pyaz", "pyaaz", "kanda", "प्याज", "प्याज़", "कांदा", "कांदे"]),
    "tomato": ("Tomato", "Vegetables", ["tomato", "tamatar", "टमाटर", "टोमॅटो", "टोमाटो"]),
    "potato": ("Potato", "Vegetables", ["potato", "aloo", "alu", "batata", "आलू", "बटाटा", "बटाटे"]),
    "wheat": ("Wheat", "Grains", ["wheat", "gehu", "gehun", "gahu", "गेहूं", "गेहूँ", "गहू"]),
    "rice": ("Rice", "Grains", ["rice", "paddy", "chawal", "tandul", "dhan", "चावल", "धान", "तांदूळ", "भात"]),
    "orange": ("Orange", "Fruits", ["orange", "santra", "santre", "संतरा", "संत्रा", "संत्री"]),
    "cotton": ("Cotton", "Other", ["cotton", "kapas", "kapus", "कपास", "कापूस"]),
    "soybean": ("Soybean", "Pulses", ["soybean", "soyabean", "soya", "सोयाबीन"]),
    "grapes": ("Grapes", "Fruits", ["grape", "angoor", "angur", "draksh", "अंगूर", "द्राक्ष", "द्राक्षे"]),
    "apple": ("Apple", "Fruits", ["apple", "seb", "सेब", "सफरचंद"]),
    "watermelon": ("Watermelon", "Fruits", ["watermelon", "tarbooz", "kalingad", "तरबूज", "तरबूज़", "कलिंगड"]),
    "chilli": ("Green Chilli", "Spices", ["chilli", "chili", "mirchi", "mirchi", "मिर्च", "मिरची"]),
    "garlic": ("Garlic", "Spices", ["garlic", "lahsun", "lasun", "लहसुन", "लसूण"]),
    "chana": ("Chana (Gram)", "Pulses", ["chana", "gram", "harbhara", "चना", "हरभरा"]),
    "tur": ("Tur (Arhar)", "Pulses", ["tur", "arhar", "toor", "तूर", "अरहर"]),
    "maize": ("Maize", "Grains", ["maize", "corn", "makka", "makai", "मक्का", "मका"]),
    "banana": ("Banana", "Fruits", ["banana", "kela", "keli", "केला", "केळी"]),
    "pomegranate": ("Pomegranate", "Fruits", ["pomegranate", "anar", "dalimb", "अनार", "डाळिंब"]),
    "cauliflower": ("Cauliflower", "Vegetables", ["cauliflower", "gobi", "phool gobi", "फूलगोभी", "गोभी", "फ्लॉवर"]),
    "brinjal": ("Brinjal", "Vegetables", ["brinjal", "baingan", "vangi", "बैंगन", "वांगी", "वांगे"]),
}


def crop_key(name):
    """Canonical key for a crop name, or a cleaned lowercase name if unknown."""
    text_ = str(name or "").lower()
    for key, (_, _, words) in CROPS.items():
        for w in words:
            if re.search(r"[a-z]", w):
                if re.search(rf"\b{re.escape(w)}", text_):
                    return key
            elif w in text_:
                return key
    return re.sub(r"[^a-z0-9]+", " ", text_).strip() or "unknown"


def crop_label(key):
    return CROPS[key][0] if key in CROPS else key.title()
