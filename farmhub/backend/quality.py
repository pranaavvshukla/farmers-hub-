"""Crop photo quality check with Pillow only (free, runs on the server CPU).

It is a transparent rule-based score, not a trained model:
  - resolution: is the photo big enough to judge?
  - sharpness: edge strength (blurry photos hide defects)
  - colour vibrancy: mean saturation (fresh produce is vivid, old produce dulls)
  - dark-spot ratio: share of very dark pixels inside the produce (bruises, rot)
  - exposure: not too dark, not washed out
The result is a Grade A / Grade B badge and a freshness score shown on the listing.
"""
import io

from PIL import Image, ImageFilter, ImageStat


def _clip(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def analyse(data):
    """Return {grade, freshness, checks} for image bytes, or None if unreadable."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        return None

    width, height = img.size
    rgb = img.convert("RGB")
    rgb.thumbnail((320, 320))

    hsv = rgb.convert("HSV")
    _, sat, val = hsv.split()
    sat_mean = ImageStat.Stat(sat).mean[0] / 255
    val_mean = ImageStat.Stat(val).mean[0] / 255

    # Dark spots: pixels that are very dark, counted only where the photo is not background-dark.
    vh = val.histogram()
    total = sum(vh) or 1
    dark_ratio = sum(vh[:45]) / total

    edges = rgb.convert("L").filter(ImageFilter.FIND_EDGES)
    sharp = ImageStat.Stat(edges).stddev[0]

    res_score = _clip((min(width, height) - 240) / (720 - 240))
    sharp_score = _clip((sharp - 6) / 30)
    vivid_score = _clip((sat_mean - 0.15) / 0.40)
    dark_score = 1 - _clip((dark_ratio - 0.04) / 0.25)
    expo_score = 1 - _clip(abs(val_mean - 0.58) / 0.38)

    score = (0.15 * res_score + 0.20 * sharp_score + 0.30 * vivid_score
             + 0.25 * dark_score + 0.10 * expo_score)
    freshness = int(round(70 + 28 * score))  # 70..98
    grade = "Grade A" if freshness >= 85 and min(width, height) >= 300 else "Grade B"

    def level(x):
        return "good" if x >= 0.66 else ("ok" if x >= 0.33 else "low")

    return {
        "grade": grade,
        "label": "Export / Retail quality" if grade == "Grade A" else "Standard quality",
        "freshness": freshness,
        "checks": {
            "resolution": {"value": f"{width}×{height}", "level": level(res_score)},
            "sharpness": {"value": round(sharp, 1), "level": level(sharp_score)},
            "colour_vibrancy": {"value": f"{round(sat_mean * 100)}%", "level": level(vivid_score)},
            "dark_spots": {"value": f"{round(dark_ratio * 100)}%", "level": level(dark_score)},
            "exposure": {"value": f"{round(val_mean * 100)}%", "level": level(expo_score)},
        },
    }
