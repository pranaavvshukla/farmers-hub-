
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from flask import Flask, request, jsonify, Response, g
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity,
    verify_jwt_in_request,
)
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from sqlalchemy import func, inspect as sa_inspect, text

from seasons import (
    ALL_YEAR,
    SEASONS,
    SEASON_KEYS,
    current_season,
    guess_season,
    normalize_season,
)
from crops import crop_key, crop_label
from kyb import BLOCKED_TYPES, BUSINESS_TYPES, mask, verify_business
from mandi import UNIT_IN_QUINTAL, benchmark, compare, district_board, live_status
from quality import analyse

# UI languages a user can pick (must match LANGS in src/i18n.js).
LANG_CODES = ("en", "hi", "mr", "bn", "te", "ta")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Anchor .env and the SQLite instance folder to this file, so starting the server
# from another folder never silently creates a new, empty database.
load_dotenv(os.path.join(BASE_DIR, ".env"))

app = Flask(__name__, instance_path=os.path.join(BASE_DIR, "instance"))

# ---------------- CONFIGURATION ----------------

app.config["SECRET_KEY"] = os.getenv(
    "SECRET_KEY", "farmhub-development-secret-key"
)

_db_url = os.getenv("DATABASE_URL", "sqlite:///farmhub.db")
if _db_url.startswith("postgres://"):  # Render/Heroku style URL
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = _db_url

# Max upload size (images are stored in the database)
app.config["MAX_CONTENT_LENGTH"] = 3 * 1024 * 1024

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

app.config["JWT_SECRET_KEY"] = os.getenv(
    "JWT_SECRET_KEY", "farmhub-jwt-secret-key"
)

app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=1)

# Platform fee deducted from every completed sale before the payout to the farmer.
PLATFORM_FEE_PERCENT = float(os.getenv("PLATFORM_FEE_PERCENT", "2"))
# Share of the payout released to the farmer when the goods are picked up (rest on delivery).
ESCROW_PICKUP_RELEASE = 0.70
# A village pool is "ready for a truck" at this many kg (a small 5-tonne truck).
POOL_TRUCK_KG = float(os.getenv("POOL_TRUCK_KG", "5000"))
# Middleman rule: in 7 days, more than this many crop types / delivery pincodes gets flagged.
FLAG_MAX_CROPS = 4
FLAG_MAX_PINCODES = 3

db = SQLAlchemy(app)
jwt = JWTManager(app)

# FRONTEND_URL may hold one or more comma-separated deployed frontend URLs.
_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
_origins += [
    o.strip().rstrip("/")
    for o in os.getenv("FRONTEND_URL", "").split(",")
    if o.strip()
]

CORS(
    app,
    resources={r"/api/*": {"origins": list(dict.fromkeys(_origins))}},
    supports_credentials=True
)


# ---------------- DATABASE MODELS ----------------

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)

    role = db.Column(db.String(20), nullable=False)

    phone = db.Column(db.String(20))
    address = db.Column(db.String(255))
    state = db.Column(db.String(100))
    district = db.Column(db.String(100))
    pincode = db.Column(db.String(6))
    language = db.Column(db.String(5))  # preferred UI language code, see LANG_CODES

    # Buyer business verification (KYB) and middleman detection
    business_type = db.Column(db.String(40))
    gstin = db.Column(db.String(15))
    fssai_no = db.Column(db.String(14))
    kyb_verified = db.Column(db.Boolean, default=False)
    kyb_verified_at = db.Column(db.DateTime)
    flagged_middleman = db.Column(db.Boolean, default=False)
    flag_reason = db.Column(db.String(255))

    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self, private=True):
        data = {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "state": self.state,
            "district": self.district,
            "pincode": self.pincode,
            "business_type": self.business_type,
            "kyb_verified": bool(self.kyb_verified),
            "flagged_middleman": bool(self.flagged_middleman),
            "flag_reason": self.flag_reason,
        }
        if private:  # the user's own profile
            data.update({
                "email": self.email,
                "phone": self.phone,
                "address": self.address,
                "language": self.language,
                "gstin": self.gstin,
                "fssai_no": self.fssai_no,
                "gstin_masked": mask(self.gstin),
                "kyb_verified_at": self.kyb_verified_at.isoformat() if self.kyb_verified_at else None,
            })
        return data


class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    farmer_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False
    )

    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(80), nullable=False)
    description = db.Column(db.Text)

    price = db.Column(db.Float, nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    unit = db.Column(db.String(30), default="kg")
    minimum_order = db.Column(db.Float, default=1)

    state = db.Column(db.String(100))
    district = db.Column(db.String(100))
    location = db.Column(db.String(255))

    image_url = db.Column(db.String(500))

    # Kharif / Rabi / Zaid / All year
    season = db.Column(db.String(20))
    # Farmer's own production cost per unit (seeds, fertiliser, labour...). Private.
    cost_price = db.Column(db.Float)

    pincode = db.Column(db.String(6))
    # Photo quality check (quality.py)
    quality_grade = db.Column(db.String(20))
    freshness_score = db.Column(db.Integer)
    # Village pooling (mini-FPO): same crop + same pincode -> one bulk lot
    pool_enabled = db.Column(db.Boolean, default=False)
    pool_id = db.Column(db.Integer, db.ForeignKey("batch_pool.id"))

    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc)
    )

    farmer = db.relationship(
        "User",
        foreign_keys=[farmer_id],
        backref="products"
    )

    def quantity_kg(self):
        factor = UNIT_IN_QUINTAL.get((self.unit or "kg").lower())
        return self.quantity * factor * 100 if factor else None

    def to_dict(self, private=False):
        data = {
            "id": self.id,
            "farmer_id": self.farmer_id,
            "farmer_name": self.farmer.name if self.farmer else None,
            "name": self.name,
            "category": self.category,
            "description": self.description,
            "price": self.price,
            "quantity": self.quantity,
            "unit": self.unit,
            "minimum_order": self.minimum_order,
            "state": self.state,
            "district": self.district,
            "location": self.location,
            "image_url": self.image_url,
            "season": self.season or guess_season(self.name),
            "pincode": self.pincode,
            "quality_grade": self.quality_grade,
            "freshness_score": self.freshness_score,
            "pool_enabled": bool(self.pool_enabled),
            "pool_id": self.pool_id,
            "farmer_rating": farmer_rating(self.farmer_id)[0],
            "farmer_reviews": farmer_rating(self.farmer_id)[1],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if private:
            data["cost_price"] = self.cost_price
        return data


class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    buyer_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False
    )

    farmer_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False
    )

    product_id = db.Column(
        db.Integer,
        db.ForeignKey("product.id"),
        nullable=False
    )

    quantity = db.Column(db.Float, nullable=False)
    total_price = db.Column(db.Float, nullable=False)

    delivery_address = db.Column(db.String(255))

    status = db.Column(
        db.String(30),
        default="pending",
        nullable=False
    )

    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc)
    )

    # Snapshots taken when the order is placed, so later product edits
    # don't change past finances.
    season = db.Column(db.String(20))
    unit_cost = db.Column(db.Float)

    # Money side of a completed sale (all in rupees, filled by the farmer).
    completed_at = db.Column(db.DateTime)
    platform_fee = db.Column(db.Float)
    transport_cost = db.Column(db.Float)
    packaging_cost = db.Column(db.Float)
    labour_cost = db.Column(db.Float)
    other_cost = db.Column(db.Float)

    delivery_pincode = db.Column(db.String(6))

    # Milestone escrow: UNPAID -> LOCKED_100 (buyer paid) -> RELEASED_70 (picked up)
    # -> SETTLED_100 (delivered, buyer's OTP checked). REFUNDED if rejected before pickup.
    escrow_status = db.Column(db.String(20), default="UNPAID")
    released_amount = db.Column(db.Float, default=0.0)
    delivery_otp = db.Column(db.String(6))
    upi_ref = db.Column(db.String(30))
    paid_at = db.Column(db.DateTime)
    picked_up_at = db.Column(db.DateTime)

    # Orders placed on a village pool share a pool_ref (one bulk order, many farmers)
    pool_id = db.Column(db.Integer, db.ForeignKey("batch_pool.id"))
    pool_ref = db.Column(db.String(12))
    # Razorpay order id while a gateway payment is in progress
    gateway_order_id = db.Column(db.String(40))

    # IMPORTANT: All three relationships are defined here.
    buyer = db.relationship(
        "User",
        foreign_keys=[buyer_id],
        backref="buyer_orders"
    )

    farmer = db.relationship(
        "User",
        foreign_keys=[farmer_id],
        backref="farmer_orders"
    )

    product = db.relationship(
        "Product",
        foreign_keys=[product_id],
        backref="orders"
    )

    def realized_at(self):
        return self.completed_at or self.created_at

    def season_key(self):
        return self.season or guess_season(self.product.name if self.product else "")

    def deductions(self):
        return {
            "platform_fee": self.platform_fee or 0.0,
            "transport": self.transport_cost or 0.0,
            "packaging": self.packaging_cost or 0.0,
            "labour": self.labour_cost or 0.0,
            "other": self.other_cost or 0.0,
        }

    def net_payout(self):
        """What actually reaches the farmer's bank after all deductions."""
        return self.total_price - sum(self.deductions().values())

    def production_cost(self):
        return (self.unit_cost or 0.0) * self.quantity

    def escrow_state(self):
        if self.escrow_status:
            return self.escrow_status
        return "SETTLED_100" if self.status == "completed" else "UNPAID"

    def held_in_escrow(self):
        """Money the buyer paid that is not yet released to the farmer."""
        if self.escrow_state() in ("LOCKED_100", "RELEASED_70"):
            return max(0.0, self.total_price - (self.released_amount or 0.0))
        return 0.0

    def to_dict(self, private=False, buyer_view=False):
        data = {
            "id": self.id,
            "buyer_id": self.buyer_id,
            "buyer_name": self.buyer.name if self.buyer else None,
            "farmer_id": self.farmer_id,
            "farmer_name": self.farmer.name if self.farmer else None,
            "product_id": self.product_id,
            "product_name": self.product.name if self.product else None,
            "product_image": self.product.image_url if self.product else None,
            "quantity": self.quantity,
            "unit": self.product.unit if self.product else None,
            "total_price": self.total_price,
            "delivery_address": self.delivery_address,
            "status": self.status,
            "season": self.season_key(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "delivery_pincode": self.delivery_pincode,
            "escrow_status": self.escrow_state(),
            "released_amount": round(self.released_amount or 0.0, 2),
            "held_in_escrow": round(self.held_in_escrow(), 2),
            "upi_ref": self.upi_ref,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "picked_up_at": self.picked_up_at.isoformat() if self.picked_up_at else None,
            "pool_id": self.pool_id,
            "pool_ref": self.pool_ref,
            "review_rating": self.review.rating if self.review else None,
            "review_comment": self.review.comment if self.review else None,
            "farmer_rating": farmer_rating(self.farmer_id)[0],
        }
        if private:  # farmer's own money details + who the buyer is
            data.update({
                "unit_cost": self.unit_cost,
                "deductions": self.deductions(),
                "net_payout": round(self.net_payout(), 2),
                "production_cost": round(self.production_cost(), 2),
                "buyer_kyb_verified": bool(self.buyer and self.buyer.kyb_verified),
                "buyer_business_type": self.buyer.business_type if self.buyer else None,
                "buyer_flagged": bool(self.buyer and self.buyer.flagged_middleman),
                "buyer_flag_reason": self.buyer.flag_reason if self.buyer else None,
            })
        if buyer_view and self.escrow_state() in ("LOCKED_100", "RELEASED_70"):
            # The buyer gives this code to the farmer only when the goods arrive.
            data["delivery_otp"] = self.delivery_otp
        return data


class Review(db.Model):
    """A buyer's rating of a farmer after a completed (delivered) order. One per order."""
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=False, unique=True)
    buyer_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    farmer_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    rating = db.Column(db.Integer, nullable=False)  # 1..5
    comment = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    order = db.relationship("Order", backref=db.backref("review", uselist=False))
    buyer = db.relationship("User", foreign_keys=[buyer_id])

    def to_dict(self):
        return {
            "id": self.id, "order_id": self.order_id, "rating": self.rating, "comment": self.comment,
            "buyer_name": self.buyer.name if self.buyer else None,
            "buyer_business_type": self.buyer.business_type if self.buyer else None,
            "product_name": self.order.product.name if self.order and self.order.product else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


def farmer_rating(farmer_id):
    """(average, count) of a farmer's reviews, cached for the current request."""
    cache = g.setdefault("ratings", {})
    if farmer_id not in cache:
        avg, count = db.session.query(func.avg(Review.rating), func.count(Review.id)).filter(
            Review.farmer_id == farmer_id).one()
        cache[farmer_id] = (round(float(avg), 1) if avg else None, count)
    return cache[farmer_id]


class Requirement(db.Model):
    """A buyer's request: 'I need X kg of Y in my district'."""
    id = db.Column(db.Integer, primary_key=True)

    buyer_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    product_name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(80), nullable=False)
    description = db.Column(db.Text)

    quantity = db.Column(db.Float, nullable=False)
    unit = db.Column(db.String(30), default="kg")
    min_price = db.Column(db.Float)
    max_price = db.Column(db.Float)
    needed_within_days = db.Column(db.Integer)

    state = db.Column(db.String(100))
    district = db.Column(db.String(100))
    location = db.Column(db.String(255))

    season = db.Column(db.String(20))

    status = db.Column(db.String(20), default="open", nullable=False)

    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc)
    )

    buyer = db.relationship("User", foreign_keys=[buyer_id], backref="requirements")

    def expires_at(self):
        if self.needed_within_days and self.created_at:
            return self.created_at + timedelta(days=self.needed_within_days)
        return None

    def is_active(self):
        if self.status != "open":
            return False
        exp = self.expires_at()
        return exp is None or exp >= utcnow_naive()

    def to_dict(self, show_contact=False):
        exp = self.expires_at()
        return {
            "id": self.id,
            "buyer_id": self.buyer_id,
            "buyer_name": self.buyer.name if self.buyer else None,
            # contact details are only shared with logged-in farmers / the owner
            "buyer_phone": self.buyer.phone if (self.buyer and show_contact) else None,
            "buyer_address": self.buyer.address if (self.buyer and show_contact) else None,
            "product_name": self.product_name,
            "category": self.category,
            "description": self.description,
            "quantity": self.quantity,
            "unit": self.unit,
            "min_price": self.min_price,
            "max_price": self.max_price,
            "needed_within_days": self.needed_within_days,
            "expires_at": exp.isoformat() if exp else None,
            "state": self.state,
            "district": self.district,
            "location": self.location,
            "season": self.season or guess_season(self.product_name),
            "status": self.status,
            "active": self.is_active(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class BatchPool(db.Model):
    """A village bulk lot: same crop, same pincode, several farmers, one truck."""
    __tablename__ = "batch_pool"

    id = db.Column(db.Integer, primary_key=True)
    crop_key = db.Column(db.String(60), nullable=False)
    crop_name = db.Column(db.String(120), nullable=False)
    pincode = db.Column(db.String(6), nullable=False)
    district = db.Column(db.String(100))
    state = db.Column(db.String(100))
    total_quantity_kg = db.Column(db.Float, default=0.0)
    target_quantity_kg = db.Column(db.Float, default=lambda: POOL_TRUCK_KG)
    avg_price_per_kg = db.Column(db.Float, default=0.0)
    status = db.Column(db.String(20), default="OPEN")  # OPEN | READY_FOR_TRUCK
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    products = db.relationship("Product", foreign_keys="Product.pool_id", backref="pool")

    def members(self):
        return [p for p in self.products if p.pool_enabled and p.quantity > 0]

    def to_dict(self):
        members = self.members()
        return {
            "id": self.id,
            "crop_key": self.crop_key,
            "crop_name": self.crop_name,
            "pincode": self.pincode,
            "district": self.district,
            "state": self.state,
            "season": guess_season(self.crop_name),
            "category": members[0].category if members else None,
            "total_quantity_kg": round(self.total_quantity_kg or 0, 1),
            "target_quantity_kg": self.target_quantity_kg,
            "fill_percent": round(min(100.0, (self.total_quantity_kg or 0) / self.target_quantity_kg * 100), 1)
            if self.target_quantity_kg else 0,
            "avg_price_per_kg": round(self.avg_price_per_kg or 0, 2),
            "status": self.status,
            "farmer_count": len({p.farmer_id for p in members}),
            "members": [{
                "product_id": p.id, "farmer_id": p.farmer_id, "farmer_name": p.farmer.name if p.farmer else None,
                "name": p.name, "quantity_kg": round(p.quantity_kg() or 0, 1),
                "price_per_kg": round(p.price / (UNIT_IN_QUINTAL[(p.unit or 'kg').lower()] * 100), 2),
                "quality_grade": p.quality_grade,
                "farmer_rating": farmer_rating(p.farmer_id)[0],
            } for p in members],
        }


class Image(db.Model):
    """Uploaded product photos live in the DB so they survive redeploys."""
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    mimetype = db.Column(db.String(50), nullable=False)
    data = db.Column(db.LargeBinary, nullable=False)
    quality_grade = db.Column(db.String(20))
    freshness_score = db.Column(db.Integer)
    quality_json = db.Column(db.Text)
    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc)
    )


# ---------------- HELPER FUNCTIONS ----------------

def success_response(message, data=None, status_code=200):
    response = {
        "success": True,
        "message": message
    }

    if data is not None:
        response["data"] = data

    return jsonify(response), status_code


def error_response(message, status_code=400):
    return jsonify({
        "success": False,
        "message": message
    }), status_code


def utcnow_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def optional_user():
    """Return the logged-in user if a valid token is sent, else None."""
    try:
        verify_jwt_in_request(optional=True)
        user_id = get_jwt_identity()
        return db.session.get(User, int(user_id)) if user_id else None
    except Exception:
        return None


def sniff_image(data):
    """Detect image type from magic bytes (never trust the filename)."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None


def get_current_user():
    user_id = get_jwt_identity()
    return db.session.get(User, int(user_id))


def required_fields(data, fields):
    return [
        field for field in fields
        if data.get(field) is None or str(data.get(field)).strip() == ""
    ]


def optional_amount(data, key):
    """A non-negative rupee amount from the request, or None when left blank."""
    value = data.get(key)
    if value is None or str(value).strip() == "":
        return None
    amount = float(value)
    if amount < 0:
        raise ValueError(f"{key} cannot be negative")
    return amount


def pick_season(data, crop_name):
    """Season from the request if valid, otherwise a guess from the crop name."""
    raw = data.get("season")
    if raw not in (None, ""):
        season = normalize_season(raw)
        if not season:
            raise ValueError("season")
        return season
    return guess_season(crop_name)


PINCODE_RE = re.compile(r"^[1-9][0-9]{5}$")


def clean_pincode(value):
    """6-digit Indian PIN code, None when blank. Raises ValueError when invalid."""
    if value in (None, ""):
        return None
    pin = re.sub(r"\s+", "", str(value))
    if not PINCODE_RE.match(pin):
        raise ValueError("PIN code must be 6 digits and not start with 0.")
    return pin


def image_quality(image_url, owner_id):
    """(grade, freshness) stored for an uploaded photo of this farmer, else (None, None)."""
    m = re.match(r"^/api/images/(\d+)$", str(image_url or ""))
    if not m:
        return None, None
    img = db.session.get(Image, int(m.group(1)))
    if not img or img.owner_id != owner_id:
        return None, None
    return img.quality_grade, img.freshness_score


def rebuild_pools():
    """Group pooled listings by (crop, pincode). A pool needs 2+ farmers; listings
    alone in their village stay normal listings until a neighbour joins."""
    groups = {}
    for p in Product.query.filter(Product.pool_enabled.is_(True)).all():
        kg = p.quantity_kg()
        if not p.pincode or not kg or kg <= 0:
            p.pool_id = None
            continue
        groups.setdefault((crop_key(p.name), p.pincode), []).append(p)

    existing = {(bp.crop_key, bp.pincode): bp for bp in BatchPool.query.all()}
    alive = set()
    for (key, pin), items in groups.items():
        if len({p.farmer_id for p in items}) < 2:
            for p in items:
                p.pool_id = None
            continue
        bp = existing.get((key, pin))
        if not bp:
            bp = BatchPool(crop_key=key, crop_name=crop_label(key), pincode=pin)
            db.session.add(bp)
            db.session.flush()
        total = sum(p.quantity_kg() for p in items)
        bp.total_quantity_kg = round(total, 2)
        bp.avg_price_per_kg = round(sum(p.price / (p.quantity_kg() / p.quantity) * p.quantity_kg()
                                        for p in items) / total, 2)
        bp.district = items[0].district
        bp.state = items[0].state
        bp.target_quantity_kg = bp.target_quantity_kg or POOL_TRUCK_KG
        bp.status = "READY_FOR_TRUCK" if total >= bp.target_quantity_kg else "OPEN"
        bp.updated_at = utcnow_naive()
        for p in items:
            p.pool_id = bp.id
        alive.add(bp.id)

    for bp in existing.values():
        if bp.id not in alive:
            for p in Product.query.filter_by(pool_id=bp.id).all():
                p.pool_id = None
            if not Order.query.filter_by(pool_id=bp.id).first():
                db.session.delete(bp)
            else:
                bp.total_quantity_kg = 0
                bp.status = "CLOSED"


def check_middleman(buyer):
    """Flag buyers who behave like aggregators: many unrelated crops or many delivery
    PIN codes within 7 days. Real restaurants and processors buy a few crops for one site."""
    since = utcnow_naive() - timedelta(days=7)
    recent = Order.query.filter(Order.buyer_id == buyer.id, Order.created_at >= since).all()
    crops = {crop_key(o.product.name) for o in recent if o.product}
    pins = {o.delivery_pincode for o in recent if o.delivery_pincode}
    reasons = []
    if len(crops) > FLAG_MAX_CROPS:
        reasons.append(f"{len(crops)} different crops in 7 days")
    if len(pins) > FLAG_MAX_PINCODES:
        reasons.append(f"deliveries to {len(pins)} different PIN codes in 7 days")
    if reasons:
        buyer.flagged_middleman = True
        buyer.flag_reason = "Possible middleman: " + " and ".join(reasons)
    return bool(reasons)


def new_otp():
    return f"{secrets.randbelow(10000):04d}"


# ---------------- HEALTH CHECK ----------------

@app.route("/", methods=["GET"])
def home():
    return success_response("FarmHub API is running!")


@app.route("/api/health", methods=["GET"])
def health():
    return success_response("FarmHub backend is healthy!")


# ---------------- AUTHENTICATION ----------------

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    missing = required_fields(
        data,
        ["name", "email", "password", "role"]
    )

    if missing:
        return error_response(
            f"Missing required fields: {', '.join(missing)}"
        )

    name = str(data["name"]).strip()
    email = str(data["email"]).strip().lower()
    password = str(data["password"])
    role = str(data["role"]).strip().lower()

    if role not in ["farmer", "buyer"]:
        return error_response("Role must be farmer or buyer.")

    if len(password) < 6:
        return error_response("Password must contain at least 6 characters.")

    if User.query.filter_by(email=email).first():
        return error_response("An account with this email already exists.", 409)

    try:
        pincode = clean_pincode(data.get("pincode"))
    except ValueError as exc:
        return error_response(str(exc))

    language = data.get("language") if data.get("language") in LANG_CODES else None

    user = User(
        name=name,
        email=email,
        password=generate_password_hash(password),
        role=role,
        phone=data.get("phone"),
        address=data.get("address"),
        state=data.get("state"),
        district=data.get("district"),
        pincode=pincode,
        language=language,
    )

    db.session.add(user)
    db.session.commit()

    return success_response(
        "Registration successful!",
        {"user": user.to_dict()},
        201
    )


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    missing = required_fields(data, ["email", "password"])

    if missing:
        return error_response("Email and password are required.")

    email = str(data["email"]).strip().lower()
    password = str(data["password"])

    user = User.query.filter_by(email=email).first()

    if not user or not check_password_hash(user.password, password):
        return error_response("Invalid email or password.", 401)

    access_token = create_access_token(identity=str(user.id))

    return success_response(
        "Login successful!",
        {
            "access_token": access_token,
            "user": user.to_dict()
        }
    )


@app.route("/api/auth/me", methods=["GET"])
@jwt_required()
def current_user():
    user = get_current_user()

    if not user:
        return error_response("User not found.", 404)

    return success_response("User profile fetched.", user.to_dict())


@app.route("/api/auth/me", methods=["PATCH"])
@jwt_required()
def update_me():
    """Update own profile: phone, address, location, PIN code, language."""
    user = get_current_user()
    if not user:
        return error_response("User not found.", 404)
    data = request.get_json(silent=True) or {}
    if "pincode" in data:
        try:
            user.pincode = clean_pincode(data["pincode"])
        except ValueError as exc:
            return error_response(str(exc))
        if user.role == "farmer":
            for p in user.products:
                p.pincode = user.pincode
            rebuild_pools()
    if "language" in data:
        if data["language"] not in LANG_CODES:
            return error_response("Unsupported language.")
        user.language = data["language"]
    if "name" in data:
        name = str(data["name"] or "").strip()
        if not name:
            return error_response("Name cannot be empty.")
        user.name = name[:100]
    for field in ("phone", "address", "state", "district"):
        if field in data:
            setattr(user, field, (str(data[field]).strip() or None) if data[field] is not None else None)
    db.session.commit()
    return success_response("Profile updated.", user.to_dict())


# ---------------- BUYER KYB (anti-middleman) ----------------

@app.route("/api/kyb/options", methods=["GET"])
def kyb_options():
    return success_response("KYB options.", {
        "business_types": BUSINESS_TYPES,
        "blocked_types": BLOCKED_TYPES,
        "gst_required_for": ["Food Processor", "Hotel/HoReCa", "Retail Chain"],
    })


@app.route("/api/buyer/verify-kyb", methods=["POST"])
@jwt_required()
def verify_kyb():
    user = get_current_user()
    if not user or user.role != "buyer":
        return error_response("Only buyers complete business verification.", 403)
    data = request.get_json(silent=True) or {}
    try:
        pincode = clean_pincode(data.get("pincode") or user.pincode)
    except ValueError as exc:
        return error_response(str(exc))
    if not pincode:
        return error_response("PIN code of your business is required.")
    result, err = verify_business(data.get("business_type"), data.get("gstin"), data.get("fssai_no"),
                                  data.get("state") or user.state)
    if err:
        user.kyb_verified = False
        if re.search(r"commission|traders cannot", err, re.I):
            user.flagged_middleman = True
            user.flag_reason = "Declared business type is a commission agent / trader"
            user.business_type = str(data.get("business_type") or "")[:40]
            db.session.commit()
        return error_response(err, 422)
    user.business_type = result["business_type"]
    user.gstin = result["gstin"]
    user.fssai_no = result["fssai_no"]
    user.pincode = pincode
    user.kyb_verified = True
    user.kyb_verified_at = utcnow_naive()
    db.session.commit()
    return success_response("Business verified! Farmers will see a verified badge on your orders.", user.to_dict())


# ---------------- MANDI & MSP BENCHMARK ----------------

@app.route("/api/mandi-price", methods=["GET"])
def mandi_price():
    crop = (request.args.get("crop") or "").strip()
    if not crop:
        return error_response("crop is required.")
    bench = benchmark(crop, request.args.get("district"), request.args.get("state"))
    if not bench:
        return success_response("No mandi data for this crop yet.", None)
    price = request.args.get("price")
    try:
        cmp_ = compare(bench, float(price), request.args.get("unit", "kg")) if price else None
    except ValueError:
        return error_response("price must be a number.")
    return success_response("Mandi benchmark.", {**bench, "comparison": cmp_})


@app.route("/api/mandi-board", methods=["GET"])
def mandi_board():
    """Every crop's mandi price (and MSP) for a state / district — shown on the map."""
    state = (request.args.get("state") or "").strip()
    district = (request.args.get("district") or "").strip()
    if not state:
        return error_response("state is required.")
    rows = district_board(state, district)
    return success_response("Mandi board.", {"state": state, "district": district, "rows": rows, "live": live_status()})


# ---------------- PRODUCTS ----------------

@app.route("/api/products", methods=["GET"])
def get_products():
    query = Product.query

    search = request.args.get("search")
    category = request.args.get("category")
    state = request.args.get("state")
    district = request.args.get("district")
    farmer_id = request.args.get("farmer_id")
    season = request.args.get("season")

    if season:
        key = normalize_season(season)
        if not key:
            return error_response("Invalid season.")
        query = query.filter(Product.season == key)

    if search:
        query = query.filter(
            Product.name.ilike(f"%{search}%")
        )

    if category:
        query = query.filter(
            Product.category.ilike(f"%{category}%")
        )

    if state:
        query = query.filter(
            Product.state.ilike(f"%{state}%")
        )

    if district:
        query = query.filter(
            Product.district.ilike(f"%{district}%")
        )

    if farmer_id:
        try:
            query = query.filter(
                Product.farmer_id == int(farmer_id)
            )
        except ValueError:
            return error_response("Invalid farmer_id.")

    products = query.order_by(Product.created_at.desc()).all()
    viewer = optional_user()

    return success_response(
        "Products fetched successfully.",
        [product.to_dict(private=bool(viewer and viewer.id == product.farmer_id))
         for product in products]
    )


@app.route("/api/products/<int:product_id>", methods=["GET"])
def get_product(product_id):
    product = db.session.get(Product, product_id)

    if not product:
        return error_response("Product not found.", 404)

    return success_response(
        "Product fetched successfully.",
        product.to_dict()
    )


@app.route("/api/products", methods=["POST"])
@jwt_required()
def add_product():
    user = get_current_user()

    if not user:
        return error_response("User not found.", 404)

    if user.role != "farmer":
        return error_response("Only farmers can add products.", 403)

    data = request.get_json(silent=True) or {}

    missing = required_fields(
        data,
        ["name", "category", "price", "quantity"]
    )

    if missing:
        return error_response(
            f"Missing required fields: {', '.join(missing)}"
        )

    try:
        price = float(data["price"])
        quantity = float(data["quantity"])
        minimum_order = float(data.get("minimum_order", 1))

        if price <= 0 or quantity <= 0 or minimum_order <= 0:
            return error_response("Price, quantity and minimum order must be positive.")

        if minimum_order > quantity:
            return error_response("Minimum order cannot exceed available quantity.")

        cost_price = optional_amount(data, "cost_price")

    except (ValueError, TypeError):
        return error_response("Price, quantity and cost must be valid positive numbers.")

    try:
        season = pick_season(data, data["name"])
    except ValueError:
        return error_response(f"Season must be one of: {', '.join(SEASON_KEYS)}.")

    product = Product(
        farmer_id=user.id,
        name=str(data["name"]).strip(),
        category=str(data["category"]).strip(),
        description=data.get("description"),
        price=price,
        quantity=quantity,
        unit=data.get("unit", "kg"),
        minimum_order=minimum_order,
        state=data.get("state") or user.state,
        district=data.get("district") or user.district,
        location=data.get("location") or user.address,
        image_url=data.get("image_url"),
        season=season,
        cost_price=cost_price,
        pincode=user.pincode,
        pool_enabled=bool(data.get("pool_enabled")),
    )
    product.quality_grade, product.freshness_score = image_quality(product.image_url, user.id)

    db.session.add(product)
    db.session.flush()
    rebuild_pools()
    db.session.commit()

    return success_response(
        "Product added successfully!",
        product.to_dict(private=True),
        201
    )


@app.route("/api/products/<int:product_id>", methods=["PUT"])
@jwt_required()
def update_product(product_id):
    user = get_current_user()

    if not user:
        return error_response("User not found.", 404)

    if user.role != "farmer":
        return error_response("Only farmers can update products.", 403)

    product = db.session.get(Product, product_id)

    if not product:
        return error_response("Product not found.", 404)

    if product.farmer_id != user.id:
        return error_response("You cannot update another farmer's product.", 403)

    data = request.get_json(silent=True) or {}

    try:
        if "price" in data:
            product.price = float(data["price"])

        if "quantity" in data:
            product.quantity = float(data["quantity"])

        if "minimum_order" in data:
            product.minimum_order = float(data["minimum_order"])

        if "cost_price" in data:
            product.cost_price = optional_amount(data, "cost_price")

        if product.price <= 0 or product.quantity < 0 or product.minimum_order <= 0:
            return error_response("Invalid price, quantity or minimum order.")

        if product.minimum_order > product.quantity and product.quantity > 0:
            return error_response("Minimum order cannot exceed available quantity.")

    except (ValueError, TypeError):
        return error_response("Price, quantity and cost must be valid numbers.")

    if "season" in data:
        season = normalize_season(data["season"])
        if not season:
            return error_response(f"Season must be one of: {', '.join(SEASON_KEYS)}.")
        product.season = season

    allowed_fields = [
        "name", "category", "description", "unit",
        "state", "district", "location", "image_url"
    ]

    for field in allowed_fields:
        if field in data:
            setattr(product, field, data[field])

    if "image_url" in data:
        product.quality_grade, product.freshness_score = image_quality(product.image_url, user.id)
    if "pool_enabled" in data:
        product.pool_enabled = bool(data["pool_enabled"])
    product.pincode = user.pincode

    rebuild_pools()
    db.session.commit()

    return success_response(
        "Product updated successfully!",
        product.to_dict(private=True)
    )


@app.route("/api/products/<int:product_id>", methods=["DELETE"])
@jwt_required()
def delete_product(product_id):
    user = get_current_user()

    if not user:
        return error_response("User not found.", 404)

    if user.role != "farmer":
        return error_response("Only farmers can delete products.", 403)

    product = db.session.get(Product, product_id)

    if not product:
        return error_response("Product not found.", 404)

    if product.farmer_id != user.id:
        return error_response("You cannot delete another farmer's product.", 403)

    if Order.query.filter_by(product_id=product.id).first():
        return error_response(
            "This product has order history and cannot be deleted.",
            409
        )

    db.session.delete(product)
    db.session.flush()
    rebuild_pools()
    db.session.commit()

    return success_response("Product deleted successfully.")


# ---------------- ORDERS ----------------

@app.route("/api/orders", methods=["POST"])
@jwt_required()
def place_order():
    user = get_current_user()

    if not user:
        return error_response("User not found.", 404)

    if user.role != "buyer":
        return error_response("Only buyers can place orders.", 403)

    data = request.get_json(silent=True) or {}

    missing = required_fields(data, ["product_id", "quantity"])

    if missing:
        return error_response(
            f"Missing required fields: {', '.join(missing)}"
        )

    try:
        product_id = int(data["product_id"])
        quantity = float(data["quantity"])

        if quantity <= 0:
            return error_response("Order quantity must be greater than zero.")

    except (ValueError, TypeError):
        return error_response("Invalid product ID or quantity.")

    product = db.session.get(Product, product_id)

    if not product:
        return error_response("Product not found.", 404)

    if product.farmer_id == user.id:
        return error_response("You cannot order your own product.")

    if quantity < product.minimum_order:
        return error_response(
            f"Minimum order quantity is {product.minimum_order} {product.unit}."
        )

    if quantity > product.quantity:
        return error_response(
            f"Only {product.quantity} {product.unit} available."
        )

    try:
        delivery_pincode = clean_pincode(data.get("delivery_pincode")) or user.pincode
    except ValueError as exc:
        return error_response(str(exc))

    total_price = round(product.price * quantity, 2)

    order = Order(
        buyer_id=user.id,
        farmer_id=product.farmer_id,
        product_id=product.id,
        quantity=quantity,
        total_price=total_price,
        delivery_address=data.get("delivery_address") or user.address,
        delivery_pincode=delivery_pincode,
        status="pending",
        season=product.season or guess_season(product.name),
        unit_cost=product.cost_price,
        escrow_status="UNPAID",
        released_amount=0.0,
    )

    # Reduce stock and create order in the same transaction.
    product.quantity -= quantity

    try:
        db.session.add(order)
        db.session.flush()
        check_middleman(user)
        rebuild_pools()
        db.session.commit()

    except Exception:
        db.session.rollback()
        app.logger.exception("Order creation failed")
        return error_response("Could not place order. Please try again.", 500)

    return success_response(
        "Order placed successfully!",
        {**order.to_dict(buyer_view=True), "buyer_flagged": bool(user.flagged_middleman)},
        201
    )


def payable_orders(user, data):
    """(orders, None) for a buyer's unpaid orders in the request, or (None, error response)."""
    if not user or user.role != "buyer":
        return None, error_response("Only buyers pay for orders.", 403)
    ids = data.get("order_ids") or ([data["order_id"]] if data.get("order_id") else [])
    try:
        ids = [int(i) for i in ids]
    except (TypeError, ValueError):
        return None, error_response("order_ids must be a list of order numbers.")
    if not ids:
        return None, error_response("No orders to pay.")
    orders = Order.query.filter(Order.id.in_(ids)).all()
    if len(orders) != len(set(ids)) or any(o.buyer_id != user.id for o in orders):
        return None, error_response("You can only pay for your own orders.", 403)
    for o in orders:
        if o.status not in ("pending", "accepted"):
            return None, error_response(f"Order #{o.id} is {o.status} and cannot be paid.")
        if o.escrow_state() != "UNPAID":
            return None, error_response(f"Order #{o.id} is already paid.")
    return orders, None


def lock_in_escrow(orders, ref):
    now = utcnow_naive()
    otp = new_otp()  # one payment = one delivery (a pooled truck), so one OTP
    for o in orders:
        o.escrow_status = "LOCKED_100"
        o.paid_at = now
        o.upi_ref = ref
        o.released_amount = 0.0
        o.delivery_otp = otp
        o.gateway_order_id = None


@app.route("/api/orders/pay", methods=["POST"])
@jwt_required()
def pay_orders():
    """Buyer pays into escrow (simulated UPI). Money is held, not yet given to the farmer."""
    orders, err = payable_orders(get_current_user(), request.get_json(silent=True) or {})
    if err:
        return err
    ref = "FHUPI" + secrets.token_hex(4).upper()
    lock_in_escrow(orders, ref)
    db.session.commit()
    return success_response(
        f"₹{sum(o.total_price for o in orders):,.2f} locked in escrow. The farmer gets 70% at pickup and the rest when you confirm delivery.",
        {"upi_ref": ref, "orders": [o.to_dict(buyer_view=True) for o in orders]},
    )


@app.route("/api/orders", methods=["GET"])
@jwt_required()
def get_orders():
    user = get_current_user()

    if not user:
        return error_response("User not found.", 404)

    if user.role == "buyer":
        orders = Order.query.filter_by(
            buyer_id=user.id
        ).order_by(Order.created_at.desc()).all()

    elif user.role == "farmer":
        orders = Order.query.filter_by(
            farmer_id=user.id
        ).order_by(Order.created_at.desc()).all()

    else:
        return error_response("Invalid user role.", 403)

    return success_response(
        "Orders fetched successfully.",
        [order.to_dict(private=user.role == "farmer", buyer_view=user.role == "buyer") for order in orders]
    )


# ---------------- RAZORPAY (test mode) ----------------
# Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (test keys: rzp_test_...) in backend/.env.
# Without them the app falls back to the simulated UPI escrow above.

def razorpay_keys():
    kid = os.getenv("RAZORPAY_KEY_ID", "").strip()
    secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    return (kid, secret) if kid and secret else (None, None)


def razorpay_create_order(amount_paise, receipt, notes):
    """POST /v1/orders on Razorpay. Separate function so tests can replace it."""
    kid, secret = razorpay_keys()
    body = json.dumps({"amount": amount_paise, "currency": "INR", "receipt": receipt, "notes": notes}).encode()
    auth = base64.b64encode(f"{kid}:{secret}".encode()).decode()
    req = urllib.request.Request("https://api.razorpay.com/v1/orders", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Basic {auth}"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.load(resp)


def razorpay_signature_ok(rzp_order_id, payment_id, signature):
    _, secret = razorpay_keys()
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), f"{rzp_order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, str(signature))


@app.route("/api/payments/config", methods=["GET"])
def payments_config():
    kid, _ = razorpay_keys()
    return success_response("Payment config.", {
        "provider": "razorpay" if kid else "demo",
        "key_id": kid,
        "test_mode": bool(kid and kid.startswith("rzp_test_")),
    })


@app.route("/api/payments/razorpay/order", methods=["POST"])
@jwt_required()
def razorpay_order():
    """Create one Razorpay order for the buyer's unpaid FarmHub order(s)."""
    kid, _ = razorpay_keys()
    if not kid:
        return error_response("Razorpay is not configured. Add test keys to backend/.env.", 503)
    user = get_current_user()
    orders, err = payable_orders(user, request.get_json(silent=True) or {})
    if err:
        return err
    amount = int(round(sum(o.total_price for o in orders) * 100))
    try:
        rzp = razorpay_create_order(amount, f"FH-{'-'.join(str(o.id) for o in orders)}"[:40],
                                    {"farmhub_orders": ",".join(str(o.id) for o in orders), "buyer": user.email})
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = json.load(exc).get("error", {}).get("description", "")
        except Exception:
            pass
        return error_response(f"Razorpay rejected the request ({exc.code}). {detail}".strip(), 502)
    except Exception:
        app.logger.exception("Razorpay order failed")
        return error_response("Could not reach Razorpay. Check internet and keys.", 502)
    for o in orders:
        o.gateway_order_id = rzp["id"]
    db.session.commit()
    return success_response("Razorpay order created.", {
        "key_id": kid, "razorpay_order_id": rzp["id"], "amount": rzp.get("amount", amount), "currency": "INR",
        "name": "FarmHub Escrow", "buyer": {"name": user.name, "email": user.email, "contact": user.phone or ""},
        "order_ids": [o.id for o in orders],
    })


@app.route("/api/payments/razorpay/verify", methods=["POST"])
@jwt_required()
def razorpay_verify():
    """Check Razorpay's signature, then lock the money in FarmHub escrow."""
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    orders, err = payable_orders(user, data)
    if err:
        return err
    rzp_order = str(data.get("razorpay_order_id") or "")
    payment_id = str(data.get("razorpay_payment_id") or "")
    if not rzp_order or any(o.gateway_order_id != rzp_order for o in orders):
        return error_response("Payment does not match these orders.", 400)
    if not razorpay_signature_ok(rzp_order, payment_id, data.get("razorpay_signature")):
        return error_response("Payment signature is not valid. Nothing was charged to escrow.", 400)
    lock_in_escrow(orders, payment_id)
    db.session.commit()
    return success_response(
        f"Paid via Razorpay ({payment_id}). ₹{sum(o.total_price for o in orders):,.2f} locked in escrow.",
        {"upi_ref": payment_id, "orders": [o.to_dict(buyer_view=True) for o in orders]},
    )


COST_FIELDS = {
    "transport_cost": "transport_cost",
    "packaging_cost": "packaging_cost",
    "labour_cost": "labour_cost",
    "other_cost": "other_cost",
    "unit_cost": "unit_cost",
}


def apply_costs(order, data):
    """Copy any cost fields present in the request onto the order (validated)."""
    for key, attr in COST_FIELDS.items():
        if key in data:
            setattr(order, attr, optional_amount(data, key))
    if sum(order.deductions().values()) > order.total_price:
        raise ValueError("Deductions cannot be more than the sale amount")


@app.route("/api/orders/<int:order_id>/status", methods=["PATCH"])
@jwt_required()
def update_order_status(order_id):
    user = get_current_user()

    if not user:
        return error_response("User not found.", 404)

    if user.role != "farmer":
        return error_response("Only farmers can update order status.", 403)

    order = db.session.get(Order, order_id)

    if not order:
        return error_response("Order not found.", 404)

    if order.farmer_id != user.id:
        return error_response("You cannot update another farmer's order.", 403)

    data = request.get_json(silent=True) or {}
    new_status = str(data.get("status", "")).strip().lower()

    allowed_statuses = ["accepted", "rejected", "picked_up", "completed"]

    if new_status not in allowed_statuses:
        return error_response(
            "Status must be accepted, picked_up, rejected or completed."
        )

    if order.status in ["completed", "rejected"]:
        return error_response(
            f"This order is already {order.status} and cannot be changed."
        )

    escrow = order.escrow_state()
    message = f"Order {new_status.replace('_', ' ')} successfully!"

    if new_status == "accepted" and order.status != "pending":
        return error_response("Only pending orders can be accepted.")

    if new_status == "rejected":
        if order.status == "picked_up":
            return error_response("The goods are already picked up. This order can no longer be rejected.")
        # Restore stock, and refund the buyer if they had paid into escrow.
        order.product.quantity += order.quantity
        if escrow == "LOCKED_100":
            order.escrow_status = "REFUNDED"
            order.released_amount = 0.0
            message = "Order rejected. The buyer's escrow payment is refunded."
        rebuild_pools()

    if new_status == "picked_up":
        if order.status != "accepted":
            return error_response("Accept the order before marking it picked up.")
        if escrow != "LOCKED_100":
            return error_response("The buyer has not paid into escrow yet. Ask them to pay before dispatch.")
        fee = round(order.total_price * PLATFORM_FEE_PERCENT / 100, 2)
        order.released_amount = round((order.total_price - fee) * ESCROW_PICKUP_RELEASE, 2)
        order.escrow_status = "RELEASED_70"
        order.picked_up_at = utcnow_naive()
        message = f"Picked up! ₹{order.released_amount:,.2f} (70%) released to your bank. The rest comes on delivery."

    if new_status == "completed":
        if escrow in ("LOCKED_100", "RELEASED_70"):
            if order.status != "picked_up":
                return error_response("Mark the order picked up first, then complete it on delivery.")
            if str(data.get("otp", "")).strip() != (order.delivery_otp or ""):
                return error_response("Delivery OTP does not match. Ask the buyer for the 4-digit code shown in their app.")
        elif order.status != "accepted":
            return error_response("Only accepted orders can be completed.")

        # Money is realised now: record the platform fee and any selling costs.
        order.completed_at = utcnow_naive()
        order.platform_fee = round(order.total_price * PLATFORM_FEE_PERCENT / 100, 2)
        try:
            apply_costs(order, data)
        except (ValueError, TypeError) as exc:
            db.session.rollback()
            return error_response(f"Invalid cost: {exc}")
        if escrow in ("LOCKED_100", "RELEASED_70"):
            order.escrow_status = "SETTLED_100"
            message = "Delivered! Escrow settled — the full payout is released to your bank."
        else:
            order.escrow_status = "OFFLINE"  # paid outside FarmHub (cash / direct UPI)
        # Escrow pays out the sale minus the platform fee; selling costs are the farmer's own spend.
        order.released_amount = round(order.total_price - order.platform_fee, 2)

    order.status = new_status
    db.session.commit()

    return success_response(
        message,
        order.to_dict(private=True)
    )


@app.route("/api/orders/<int:order_id>/costs", methods=["PATCH"])
@jwt_required()
def update_order_costs(order_id):
    """Farmer records transport, packaging, labour and other costs of a completed sale."""
    user = get_current_user()
    order = db.session.get(Order, order_id)

    if not order:
        return error_response("Order not found.", 404)

    if not user or user.role != "farmer" or order.farmer_id != user.id:
        return error_response("You can only edit costs of your own orders.", 403)

    if order.status != "completed":
        return error_response("Costs can be added only to completed orders.")

    data = request.get_json(silent=True) or {}
    try:
        apply_costs(order, data)
    except (ValueError, TypeError) as exc:
        db.session.rollback()
        return error_response(f"Invalid cost: {exc}")

    db.session.commit()
    return success_response("Costs saved.", order.to_dict(private=True))


# ---------------- VILLAGE POOLS (mini-FPO) ----------------

@app.route("/api/pools", methods=["GET"])
def get_pools():
    pools = BatchPool.query.order_by(BatchPool.total_quantity_kg.desc()).all()
    rows = [bp.to_dict() for bp in pools if bp.status != "CLOSED"]
    rows = [r for r in rows if r["farmer_count"] >= 2]
    district = request.args.get("district")
    if district:
        rows = [r for r in rows if (r["district"] or "").lower() == district.lower()]
    return success_response("Pools fetched.", rows)


@app.route("/api/pools/<int:pool_id>/order", methods=["POST"])
@jwt_required()
def order_pool(pool_id):
    """One bulk order on a village pool, split across its farmers in proportion to
    what each has listed. Each farmer gets their own order (and payout) for their share."""
    user = get_current_user()
    if not user or user.role != "buyer":
        return error_response("Only buyers can order from a pool.", 403)
    bp = db.session.get(BatchPool, pool_id)
    if not bp or bp.status == "CLOSED":
        return error_response("Pool not found.", 404)
    data = request.get_json(silent=True) or {}
    try:
        want = float(data.get("quantity_kg"))
        delivery_pincode = clean_pincode(data.get("delivery_pincode")) or user.pincode
    except (TypeError, ValueError) as exc:
        return error_response(str(exc) if "PIN" in str(exc) else "quantity_kg must be a number.")
    members = bp.members()
    available = sum(p.quantity_kg() for p in members)
    if want <= 0:
        return error_response("Quantity must be greater than zero.")
    if want > available + 1e-6:
        return error_response(f"Only {available:,.0f} kg available in this pool.")

    # Proportional split, rounded to whole kg; the last member takes the remainder.
    shares, left = [], want
    for i, p in enumerate(members):
        kg = left if i == len(members) - 1 else round(want * p.quantity_kg() / available)
        kg = min(kg, p.quantity_kg(), left)
        left -= kg
        if kg > 0:
            shares.append((p, kg))

    ref = "POOL" + secrets.token_hex(3).upper()
    orders = []
    for p, kg in shares:
        kg_per_unit = p.quantity_kg() / p.quantity
        qty = round(kg / kg_per_unit, 3)
        o = Order(
            buyer_id=user.id, farmer_id=p.farmer_id, product_id=p.id, quantity=qty,
            total_price=round(p.price * qty, 2),
            delivery_address=data.get("delivery_address") or user.address,
            delivery_pincode=delivery_pincode, status="pending",
            season=p.season or guess_season(p.name), unit_cost=p.cost_price,
            escrow_status="UNPAID", released_amount=0.0, pool_id=bp.id, pool_ref=ref,
        )
        p.quantity = round(p.quantity - qty, 3)
        db.session.add(o)
        orders.append(o)
    db.session.flush()
    check_middleman(user)
    rebuild_pools()
    db.session.commit()
    total = sum(o.total_price for o in orders)
    return success_response(
        f"Pooled order placed with {len(orders)} farmers for ₹{total:,.2f}.",
        {"pool_ref": ref, "total_price": round(total, 2), "orders": [o.to_dict(buyer_view=True) for o in orders]},
        201,
    )


@app.route("/api/orders/<int:order_id>/cancel", methods=["PATCH"])
@jwt_required()
def cancel_order(order_id):
    """Buyer cancels an order the farmer has not accepted yet (paid money is refunded)."""
    user = get_current_user()
    order = db.session.get(Order, order_id)
    if not order:
        return error_response("Order not found.", 404)
    if not user or order.buyer_id != user.id:
        return error_response("You can only cancel your own orders.", 403)
    if order.status != "pending":
        return error_response("Only orders the farmer has not accepted yet can be cancelled.")
    order.status = "cancelled"
    order.product.quantity += order.quantity
    message = "Order cancelled."
    if order.escrow_state() == "LOCKED_100":
        order.escrow_status = "REFUNDED"
        order.released_amount = 0.0
        message = "Order cancelled. Your escrow payment is refunded."
    rebuild_pools()
    db.session.commit()
    return success_response(message, order.to_dict(buyer_view=True))


@app.route("/api/orders/<int:order_id>/review", methods=["POST"])
@jwt_required()
def review_order(order_id):
    """Buyer rates the farmer (1-5 stars) after the order is delivered."""
    user = get_current_user()
    order = db.session.get(Order, order_id)
    if not order:
        return error_response("Order not found.", 404)
    if not user or order.buyer_id != user.id:
        return error_response("You can only review your own orders.", 403)
    if order.status != "completed":
        return error_response("You can review an order after it is delivered.")
    if order.review:
        return error_response("You have already reviewed this order.", 409)
    data = request.get_json(silent=True) or {}
    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        return error_response("Rating must be a number from 1 to 5.")
    if not 1 <= rating <= 5:
        return error_response("Rating must be a number from 1 to 5.")
    review = Review(order_id=order.id, buyer_id=user.id, farmer_id=order.farmer_id, rating=rating,
                    comment=(str(data.get("comment") or "").strip()[:500] or None))
    db.session.add(review)
    db.session.commit()
    g.pop("ratings", None)
    return success_response("Thank you! Your review helps other buyers.", order.to_dict(buyer_view=True))


@app.route("/api/farmers/<int:farmer_id>/reviews", methods=["GET"])
def farmer_reviews(farmer_id):
    farmer = db.session.get(User, farmer_id)
    if not farmer or farmer.role != "farmer":
        return error_response("Farmer not found.", 404)
    reviews = Review.query.filter_by(farmer_id=farmer_id).order_by(Review.created_at.desc()).all()
    avg, count = farmer_rating(farmer_id)
    stars = {s: sum(1 for r in reviews if r.rating == s) for s in range(1, 6)}
    return success_response("Reviews fetched.", {
        "farmer": {"id": farmer.id, "name": farmer.name, "district": farmer.district, "state": farmer.state},
        "average": avg, "count": count, "stars": stars,
        "reviews": [r.to_dict() for r in reviews[:50]],
    })


# ---------------- IMAGE UPLOAD ----------------

@app.route("/api/upload", methods=["POST"])
@jwt_required()
def upload_image():
    user = get_current_user()

    if not user or user.role != "farmer":
        return error_response("Only farmers can upload product photos.", 403)

    file = request.files.get("file")
    if not file:
        return error_response("No file received.")

    data = file.read()
    if not data:
        return error_response("The file is empty.")

    mimetype = sniff_image(data)
    if not mimetype:
        return error_response("Only JPG, PNG, WEBP or GIF images are allowed.")

    report = analyse(data)
    image = Image(
        owner_id=user.id, mimetype=mimetype, data=data,
        quality_grade=report["grade"] if report else None,
        freshness_score=report["freshness"] if report else None,
        quality_json=json.dumps(report) if report else None,
    )
    db.session.add(image)
    db.session.commit()

    return success_response(
        "Image uploaded.",
        {"url": f"/api/images/{image.id}", "quality": report},
        201
    )


@app.route("/api/images/<int:image_id>", methods=["GET"])
def get_image(image_id):
    image = db.session.get(Image, image_id)

    if not image:
        return error_response("Image not found.", 404)

    return Response(
        image.data,
        mimetype=image.mimetype,
        headers={"Cache-Control": "public, max-age=86400"}
    )


# ---------------- BUYER REQUIREMENTS ----------------

@app.route("/api/requirements", methods=["GET"])
def get_requirements():
    viewer = optional_user()
    query = Requirement.query

    for field in ("state", "district", "category"):
        value = request.args.get(field)
        if value:
            query = query.filter(getattr(Requirement, field).ilike(f"%{value}%"))

    search = request.args.get("search")
    if search:
        query = query.filter(Requirement.product_name.ilike(f"%{search}%"))

    season = request.args.get("season")
    if season:
        key = normalize_season(season)
        if not key:
            return error_response("Invalid season.")
        query = query.filter(Requirement.season == key)

    buyer_id = request.args.get("buyer_id")
    if buyer_id:
        try:
            query = query.filter(Requirement.buyer_id == int(buyer_id))
        except ValueError:
            return error_response("Invalid buyer_id.")

    items = query.order_by(Requirement.created_at.desc()).all()

    # Owners can see their own closed/expired ones; everyone else only active ones.
    if not (buyer_id and viewer and viewer.id == int(buyer_id)):
        items = [r for r in items if r.is_active()]

    return success_response(
        "Requirements fetched successfully.",
        [
            r.to_dict(
                show_contact=bool(
                    viewer and (viewer.role == "farmer" or viewer.id == r.buyer_id)
                )
            )
            for r in items
        ]
    )


@app.route("/api/requirements", methods=["POST"])
@jwt_required()
def add_requirement():
    user = get_current_user()

    if not user:
        return error_response("User not found.", 404)

    if user.role != "buyer":
        return error_response("Only buyers can post requirements.", 403)

    data = request.get_json(silent=True) or {}

    missing = required_fields(data, ["product_name", "category", "quantity"])
    if missing:
        return error_response(f"Missing required fields: {', '.join(missing)}")

    def opt_float(key):
        value = data.get(key)
        return None if value in (None, "") else float(value)

    try:
        quantity = float(data["quantity"])
        min_price = opt_float("min_price")
        max_price = opt_float("max_price")
        days = data.get("needed_within_days")
        days = None if days in (None, "") else int(days)
    except (ValueError, TypeError):
        return error_response("Quantity, prices and days must be valid numbers.")

    if quantity <= 0:
        return error_response("Quantity must be greater than zero.")

    if (min_price is not None and min_price < 0) or (max_price is not None and max_price < 0):
        return error_response("Prices cannot be negative.")

    if min_price is not None and max_price is not None and min_price > max_price:
        return error_response("Minimum price cannot exceed maximum price.")

    if days is not None and days <= 0:
        return error_response("Days must be greater than zero.")

    try:
        season = pick_season(data, data["product_name"])
    except ValueError:
        return error_response(f"Season must be one of: {', '.join(SEASON_KEYS)}.")

    req = Requirement(
        buyer_id=user.id,
        product_name=str(data["product_name"]).strip(),
        category=str(data["category"]).strip(),
        description=data.get("description"),
        quantity=quantity,
        unit=data.get("unit", "kg"),
        min_price=min_price,
        max_price=max_price,
        needed_within_days=days,
        state=data.get("state") or user.state,
        district=data.get("district") or user.district,
        location=data.get("location") or user.address,
        season=season,
    )

    db.session.add(req)
    db.session.commit()

    return success_response(
        "Requirement posted successfully!",
        req.to_dict(show_contact=True),
        201
    )


@app.route("/api/requirements/<int:req_id>/status", methods=["PATCH"])
@jwt_required()
def update_requirement_status(req_id):
    user = get_current_user()
    req = db.session.get(Requirement, req_id)

    if not req:
        return error_response("Requirement not found.", 404)

    if not user or req.buyer_id != user.id:
        return error_response("You can only change your own requirements.", 403)

    data = request.get_json(silent=True) or {}
    new_status = str(data.get("status", "")).strip().lower()

    if new_status not in ("open", "closed"):
        return error_response("Status must be open or closed.")

    req.status = new_status
    db.session.commit()

    return success_response("Requirement updated.", req.to_dict(show_contact=True))


@app.route("/api/requirements/<int:req_id>", methods=["DELETE"])
@jwt_required()
def delete_requirement(req_id):
    user = get_current_user()
    req = db.session.get(Requirement, req_id)

    if not req:
        return error_response("Requirement not found.", 404)

    if not user or req.buyer_id != user.id:
        return error_response("You can only delete your own requirements.", 403)

    db.session.delete(req)
    db.session.commit()

    return success_response("Requirement deleted.")


# ---------------- DASHBOARD STATS ----------------

@app.route("/api/stats", methods=["GET"])
@jwt_required()
def get_stats():
    user = get_current_user()

    if not user:
        return error_response("User not found.", 404)

    statuses = ["pending", "accepted", "picked_up", "completed", "rejected", "cancelled"]

    if user.role == "farmer":
        orders = Order.query.filter_by(farmer_id=user.id).all()
        by_status = {s: sum(1 for o in orders if o.status == s) for s in statuses}
        products = Product.query.filter_by(farmer_id=user.id).all()

        nearby = [
            r for r in Requirement.query.all()
            if r.is_active()
            and user.district
            and (r.district or "").lower() == user.district.lower()
        ]

        return success_response("Stats fetched.", {
            "role": "farmer",
            "total_orders": len(orders),
            "by_status": by_status,
            "revenue": round(sum(o.total_price for o in orders if o.status == "completed"), 2),
            "net_received": round(sum(o.net_payout() for o in orders if o.status == "completed"), 2),
            "platform_fee_percent": PLATFORM_FEE_PERCENT,
            "current_season": current_season(),
            "pipeline_value": round(
                sum(o.total_price for o in orders if o.status in ("pending", "accepted", "picked_up")), 2
            ),
            "escrow_held": round(sum(o.held_in_escrow() for o in orders), 2),
            "escrow_released_on_pickup": round(
                sum(o.released_amount or 0 for o in orders if o.escrow_state() == "RELEASED_70"), 2
            ),
            "pooled_listings": sum(1 for p in products if p.pool_id),
            "rating": farmer_rating(user.id)[0],
            "review_count": farmer_rating(user.id)[1],
            "pincode": user.pincode,
            "total_products": len(products),
            "active_listings": sum(1 for p in products if p.quantity > 0),
            "nearby_requirements": len(nearby),
        })

    orders = Order.query.filter_by(buyer_id=user.id).all()
    by_status = {s: sum(1 for o in orders if o.status == s) for s in statuses}
    reqs = Requirement.query.filter_by(buyer_id=user.id).all()

    return success_response("Stats fetched.", {
        "role": "buyer",
        "total_orders": len(orders),
        "by_status": by_status,
        "total_spent": round(
            sum(o.total_price for o in orders if o.status in ("accepted", "picked_up", "completed")), 2
        ),
        "awaiting_payment": sum(1 for o in orders if o.status in ("pending", "accepted")
                                and o.escrow_state() == "UNPAID"),
        "in_escrow": round(sum(o.held_in_escrow() for o in orders), 2),
        "kyb_verified": bool(user.kyb_verified),
        "flagged_middleman": bool(user.flagged_middleman),
        "open_requirements": sum(1 for r in reqs if r.is_active()),
    })


# ---------------- SEASONAL CROPS ----------------

@app.route("/api/seasons", methods=["GET"])
def get_seasons():
    """Crop calendar plus how many live listings / open requirements each season has."""
    now = current_season()
    products = Product.query.filter(Product.quantity > 0).all()
    reqs = [r for r in Requirement.query.all() if r.is_active()]

    def count(items, key, name_attr):
        return sum(1 for i in items if (i.season or guess_season(getattr(i, name_attr))) == key)

    seasons = []
    for s in SEASONS + [{"key": ALL_YEAR, "label": "All year", "months": [], "sowing": "-",
                         "harvest": "-", "crops": ["Tea", "Pomegranate", "Banana", "Milk"]}]:
        seasons.append({
            **s,
            "is_current": s["key"] == now,
            "live_listings": count(products, s["key"], "name"),
            "open_requirements": count(reqs, s["key"], "product_name"),
        })

    return success_response("Seasons fetched.", {"current": now, "seasons": seasons})


# ---------------- FINANCE DASHBOARD ----------------

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
QUARTERS = ["Q1 (Jan-Mar)", "Q2 (Apr-Jun)", "Q3 (Jul-Sep)", "Q4 (Oct-Dec)"]
SEASON_ORDER = SEASON_KEYS


def _r(x):
    return round(x, 2)


def _buckets(items, when, period, year, years):
    """Group items into month / quarter / year buckets: [(label, [items])]."""
    if period == "monthly":
        groups = [(f"{m} {year}", []) for m in MONTHS]
        for i in items:
            groups[when(i).month - 1][1].append(i)
    elif period == "quarterly":
        groups = [(f"{q} {year}", []) for q in QUARTERS]
        for i in items:
            groups[(when(i).month - 1) // 3][1].append(i)
    else:
        groups = [(str(y), [i for i in items if when(i).year == y]) for y in sorted(years)]
    return groups


def _farmer_summary(items):
    gross = sum(o.total_price for o in items)
    production = sum(o.production_cost() for o in items)
    ded = {k: 0.0 for k in ("platform_fee", "transport", "packaging", "labour", "other")}
    for o in items:
        for k, v in o.deductions().items():
            ded[k] += v
    ded_total = sum(ded.values())
    net = gross - ded_total
    return {
        "orders": len(items),
        "gross_sales": _r(gross),
        "deductions": {k: _r(v) for k, v in ded.items()},
        "deductions_total": _r(ded_total),
        "net_received": _r(net),
        "production_cost": _r(production),
        "gross_profit": _r(gross - production),
        "net_profit": _r(net - production),
        "margin_percent": _r((gross - production) / gross * 100) if gross else 0,
    }


def _top_crops(items, amount, extra=None):
    crops = {}
    for o in items:
        name = o.product.name if o.product else "Unknown"
        c = crops.setdefault(name, {"name": name, "unit": o.product.unit if o.product else "",
                                    "quantity": 0.0, "amount": 0.0, "orders": 0, "extra": 0.0})
        c["quantity"] += o.quantity
        c["amount"] += amount(o)
        c["orders"] += 1
        if extra:
            c["extra"] += extra(o)
    rows = sorted(crops.values(), key=lambda c: c["amount"], reverse=True)
    for c in rows:
        c["quantity"] = _r(c["quantity"])
        c["amount"] = _r(c["amount"])
        c["extra"] = _r(c["extra"])
    return rows


@app.route("/api/finance", methods=["GET"])
@jwt_required()
def get_finance():
    user = get_current_user()
    if not user:
        return error_response("User not found.", 404)

    period = request.args.get("period", "monthly")
    if period not in ("monthly", "quarterly", "yearly"):
        return error_response("Period must be monthly, quarterly or yearly.")

    if user.role == "farmer":
        # Only completed sales are money in the bank.
        orders = Order.query.filter_by(farmer_id=user.id).all()
        realized = [o for o in orders if o.status == "completed"]
        when = Order.realized_at
    else:
        # A buyer has spent money once the farmer accepts the order.
        orders = Order.query.filter_by(buyer_id=user.id).all()
        realized = [o for o in orders if o.status in ("accepted", "picked_up", "completed")]
        when = lambda o: o.created_at  # noqa: E731

    years = sorted({when(o).year for o in realized}, reverse=True) or [utcnow_naive().year]
    try:
        year = int(request.args.get("year") or years[0])
    except ValueError:
        return error_response("Invalid year.")

    scope = realized if period == "yearly" else [o for o in realized if when(o).year == year]
    groups = _buckets(scope, when, period, year, years)

    if user.role == "farmer":
        pipeline = [o for o in orders if o.status in ("pending", "accepted", "picked_up")]
        by_season = []
        for key in SEASON_ORDER:
            items = [o for o in scope if o.season_key() == key]
            if items:
                s = _farmer_summary(items)
                by_season.append({"season": key, "orders": s["orders"], "gross_sales": s["gross_sales"],
                                  "gross_profit": s["gross_profit"], "net_received": s["net_received"]})
        recent = sorted(scope, key=when, reverse=True)[:50]
        return success_response("Finance fetched.", {
            "role": "farmer",
            "period": period,
            "year": year,
            "years": years,
            "platform_fee_percent": PLATFORM_FEE_PERCENT,
            "totals": _farmer_summary(scope),
            "pipeline_value": _r(sum(o.total_price for o in pipeline)),
            "escrow_held": _r(sum(o.held_in_escrow() for o in orders)),
            "escrow_released_on_pickup": _r(sum(o.released_amount or 0 for o in orders
                                               if o.escrow_state() == "RELEASED_70")),
            "missing_cost_orders": sum(1 for o in scope if o.unit_cost is None),
            "periods": [{"label": label, **_farmer_summary(items)} for label, items in groups],
            "top_crops": [{"name": c["name"], "unit": c["unit"], "quantity": c["quantity"],
                           "gross_sales": c["amount"], "net_received": c["extra"], "orders": c["orders"]}
                          for c in _top_crops(scope, lambda o: o.total_price, Order.net_payout)][:6],
            "by_season": by_season,
            "orders": [o.to_dict(private=True) for o in recent],
        })

    def spend(items):
        return {"orders": len(items), "spent": _r(sum(o.total_price for o in items)),
                "quantity": _r(sum(o.quantity for o in items))}

    by_season = []
    for key in SEASON_ORDER:
        items = [o for o in scope if o.season_key() == key]
        if items:
            by_season.append({"season": key, **spend(items)})
    return success_response("Finance fetched.", {
        "role": "buyer",
        "period": period,
        "year": year,
        "years": years,
        "totals": spend(scope),
        "pending_value": _r(sum(o.total_price for o in orders if o.status == "pending")),
        "periods": [{"label": label, **spend(items)} for label, items in groups],
        "top_crops": [{"name": c["name"], "unit": c["unit"], "quantity": c["quantity"],
                       "spent": c["amount"], "orders": c["orders"],
                       "avg_price": _r(c["amount"] / c["quantity"]) if c["quantity"] else 0}
                      for c in _top_crops(scope, lambda o: o.total_price)][:6],
        "by_season": by_season,
    })


# ---------------- ERROR HANDLERS ----------------

@app.errorhandler(404)
def not_found(error):
    return error_response("Requested API endpoint not found.", 404)


@app.errorhandler(413)
def too_large(error):
    return error_response("File is too large (max 3 MB).", 413)


@app.errorhandler(405)
def method_not_allowed(error):
    return error_response("Method not allowed for this endpoint.", 405)


@app.errorhandler(500)
def internal_server_error(error):
    db.session.rollback()
    app.logger.exception("Internal server error")
    return error_response("Internal server error. Check the backend terminal.", 500)


# ---------------- DATABASE INITIALIZATION ----------------

def ensure_schema():
    """db.create_all() never alters existing tables, so add any new columns
    (season, costs...) to an older database and back-fill crop seasons."""
    engine = db.engine
    inspector = sa_inspect(engine)
    quote = engine.dialect.identifier_preparer.quote
    with engine.begin() as conn:
        for table in db.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name not in existing:
                    col_type = column.type.compile(dialect=engine.dialect)
                    conn.execute(text(
                        f"ALTER TABLE {quote(table.name)} ADD COLUMN {quote(column.name)} {col_type}"
                    ))

    changed = False
    for p in Product.query.filter(Product.season.is_(None)).all():
        p.season = guess_season(p.name)
        changed = True
    for r in Requirement.query.filter(Requirement.season.is_(None)).all():
        r.season = guess_season(r.product_name)
        changed = True
    for o in Order.query.filter(Order.escrow_status.is_(None)).all():
        o.escrow_status = "SETTLED_100" if o.status == "completed" else (
            "OFFLINE" if o.status == "accepted" else "UNPAID")
        o.released_amount = round(o.total_price - (o.platform_fee or 0), 2) if o.status == "completed" else 0.0
        changed = True
    for p in Product.query.filter(Product.pincode.is_(None)).all():
        if p.farmer and p.farmer.pincode:
            p.pincode = p.farmer.pincode
            changed = True
    if changed:
        db.session.commit()


with app.app_context():
    db.create_all()
    ensure_schema()

    # Optional: auto-load demo data on first start (handy for free hosting
    # without a shell).  Set SEED_DEMO=1 in the environment.
    if os.getenv("SEED_DEMO") == "1":
        from demo_data import seed_if_empty
        seed_if_empty(db, User, Product, Requirement, Order, after=rebuild_pools, Review=Review)


# ---------------- RUN SERVER ----------------

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", 5000)),
        debug=True
    )
