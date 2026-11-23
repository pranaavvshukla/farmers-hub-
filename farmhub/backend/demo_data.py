"""Demo data shared by seed.py (manual) and app.py (SEED_DEMO=1 auto-seed)."""
from datetime import datetime, timedelta, timezone

from werkzeug.security import generate_password_hash

from kyb import GST_STATE_CODES, make_gstin

STATE_CODE = {name: code for code, name in GST_STATE_CODES.items()}
from seasons import guess_season

PASSWORD = "farmhub123"
PLATFORM_FEE_PERCENT = 2

# (name, email, state, district, address, pincode, language)
FARMERS = [
    ("Ramesh Patil", "ramesh@farmhub.test", "Maharashtra", "Nashik", "Dindori, Nashik", "422202", "mr"),
    ("Deshmukh Farms", "deshmukh@farmhub.test", "Maharashtra", "Pune", "Baramati, Pune", "413102", "mr"),
    ("Vidarbha Agro", "vidarbha@farmhub.test", "Maharashtra", "Nagpur", "Katol, Nagpur", "441302", "mr"),
    ("Gill Farms", "gill@farmhub.test", "Punjab", "Ludhiana", "Ludhiana", "141001", "hi"),
    ("Valley Apple Farms", "valley@farmhub.test", "Jammu and Kashmir", "Srinagar", "Srinagar", "190001", "en"),
    ("Sunita Pawar", "sunita@farmhub.test", "Maharashtra", "Nashik", "Mohadi, Dindori, Nashik", "422202", "mr"),
    ("Ganesh Jadhav", "ganesh@farmhub.test", "Maharashtra", "Nashik", "Vani, Dindori, Nashik", "422202", "mr"),
    # Chhattisgarh
    ("Rameshwar Sahu", "durg@farmhub.test", "Chhattisgarh", "Durg", "Patan, Durg", "491111", "hi"),
    ("Kamla Verma", "kamla@farmhub.test", "Chhattisgarh", "Durg", "Patan, Durg", "491111", "hi"),
    ("Dhaneshwar Patel", "raipurfarm@farmhub.test", "Chhattisgarh", "Raipur", "Abhanpur, Raipur", "493661", "hi"),
    ("Bastar Makka Kisan Samooh", "bastar@farmhub.test", "Chhattisgarh", "Kondagaon", "Keshkal, Kondagaon", "494229", "hi"),
]

# (farmer index, name, category, price, qty, unit, min order, cost per unit, description, pool with neighbours)
PRODUCTS = [
    (0, "Green Grapes", "Fruits", 38, 2500, "kg", 50, 22, "Sweet seedless grapes, freshly harvested.", False),
    (0, "Fresh Red Tomatoes", "Vegetables", 20, 500, "kg", 20, 11, "Farm-fresh red tomatoes.", True),
    (1, "Yellow Onions", "Vegetables", 20, 1800, "kg", 100, 12, "Good storage quality onions.", False),
    (2, "Nagpur Oranges", "Fruits", 32, 3000, "kg", 100, 18, "Juicy oranges from Katol.", False),
    (3, "Wheat", "Grains", 24, 4000, "kg", 200, 16, "Clean, sorted wheat.", False),
    (3, "Organic Potatoes", "Vegetables", 25, 1200, "kg", 50, 14, "Organically grown potatoes.", False),
    (4, "Kashmiri Apples", "Fruits", 65, 3500, "kg", 50, 38, "Crisp apples from the valley.", False),
    (0, "Sweet Watermelon", "Fruits", 14, 1500, "kg", 100, 6, "Summer watermelons, deep red inside.", False),
    # Dindori (422202) village pools: onion from 3 farmers, tomato from 2
    (0, "Red Onion", "Vegetables", 17, 1500, "kg", 100, 10, "Lal kanda, dried in the field.", True),
    (5, "Nashik Onion", "Vegetables", 1650, 20, "quintal", 1, 1000, "Medium-size red onion, sorted.", True),
    (6, "Lal Kanda Onion", "Vegetables", 17.5, 1200, "kg", 100, 10.5, "Fresh harvest, good shine.", True),
    (5, "Desi Tomatoes", "Vegetables", 19, 600, "kg", 20, 10, "Firm tomatoes for hotels.", True),
    # Chhattisgarh: Durg tomato pool (PIN 491111), Raipur paddy + Dubraj rice, Kondagaon maize
    (7, "Durg Desi Tomato", "Vegetables", 14, 1800, "kg", 50, 7, "Firm red tomatoes from Patan, Durg.", True),
    (8, "Hybrid Tomato", "Vegetables", 13.5, 2200, "kg", 50, 7, "Fresh hybrid tomatoes, sorted.", True),
    (9, "Paddy (Dhan) Swarna", "Grains", 2450, 60, "quintal", 5, 1500, "Swarna paddy, sun-dried, low moisture.", False),
    (9, "Dubraj Rice", "Grains", 62, 800, "kg", 50, 35, "Aromatic Dubraj rice, Chhattisgarh's own.", False),
    (10, "Bastar Maize", "Grains", 21, 3000, "kg", 100, 12, "Yellow maize from Keshkal, Kondagaon.", False),
]

# (name, email, phone, state, district, address, pincode, business type, PAN for GSTIN, FSSAI)
BUYERS = [
    ("Demo Buyer", "buyer@farmhub.test", "9111111111", "Maharashtra", "Nagpur", "Sitabuldi, Nagpur", "440012",
     "Hotel/HoReCa", "AAFCD1234K", "11521998000123"),
    ("FreshMart Wholesale", "freshmart@farmhub.test", "9222222222", "Maharashtra", "Nashik", "Nashik Road, Nashik", "422101",
     "Retail Chain", "AABCF5678M", "11522034000456"),
    ("Orange City Retail", "orangecity@farmhub.test", "9333333333", "Maharashtra", "Nagpur", "Itwari, Nagpur", "440002",
     "Retail Chain", "AACCO4321P", "11521045000789"),
    # Test case for the anti-middleman rule: buys everything, ships everywhere.
    ("Quick Traders", "quick@farmhub.test", "9444444444", "Maharashtra", "Nashik", "Panchavati, Nashik", "422003",
     "Individual", None, None),
    ("Annapurna Hotels Raipur", "raipur@farmhub.test", "9555555555", "Chhattisgarh", "Raipur", "Shankar Nagar, Raipur",
     "492007", "Hotel/HoReCa", "AAGCA2345R", "11522035000321"),
]
FLAGGED_BUYER = 3

# (buyer index, product, category, qty, unit, min price, max price, days, description)
REQUIREMENTS = [
    (1, "Green Grapes", "Fruits", 5000, "kg", 35, 45, 30, "Need export-quality grapes, regular supply."),
    (2, "Oranges", "Fruits", 1500, "kg", 30, 36, 30, "Looking for fresh Nagpur oranges for retail."),
    (0, "Tomatoes", "Vegetables", 300, "kg", 15, 22, 30, "Weekly requirement for our restaurant."),
    (1, "Onion", "Vegetables", 4000, "kg", 16, 19, 20, "Truckload of red onion for our stores."),
    (4, "Tomatoes", "Vegetables", 2000, "kg", 12, 16, 15, "Daily kitchen supply for our 3 hotels in Raipur."),
    (4, "Dubraj Rice", "Grains", 500, "kg", 55, 65, 30, "Aromatic rice for the restaurant menu."),
]

# Past sales so the finance dashboards have history.
# (product index, buyer index, qty, months ago, day, status, transport, packaging, labour, other)
ORDERS = [
    (0, 1, 400, 13, 22, "completed", 1000, 600, 400, 0),
    (0, 1, 700, 12, 3, "completed", 1600, 1000, 600, 0),
    (0, 1, 500, 10, 12, "completed", 1200, 800, 500, 0),
    (0, 1, 800, 9, 8, "completed", 1800, 1200, 700, 300),
    (0, 0, 300, 8, 20, "completed", 700, 450, 300, 0),
    (0, 1, 600, 7, 5, "completed", 1500, 900, 600, 0),
    (1, 0, 200, 6, 15, "completed", 400, 0, 200, 0),
    (1, 2, 150, 4, 10, "completed", 350, 0, 150, 0),
    (1, 0, 250, 1, 18, "completed", 500, 200, 250, 0),
    (1, 0, 100, 0, 10, "accepted", 0, 0, 0, 0),      # paid into escrow, waiting for pickup
    (0, 2, 200, 0, 20, "pending", 0, 0, 0, 0),       # new order, buyer has not paid yet
    (0, 1, 300, 0, 12, "picked_up", 0, 0, 0, 0),     # in transit: 70% already released
    (3, 2, 600, 11, 6, "completed", 1500, 600, 500, 0),
    (3, 0, 400, 2, 14, "completed", 900, 400, 300, 0),
    (4, 0, 1000, 7, 25, "completed", 2500, 800, 900, 0),
    (6, 1, 300, 3, 9, "completed", 1800, 900, 450, 0),
    (7, 0, 900, 7, 18, "completed", 1200, 0, 450, 0),
    (7, 2, 600, 6, 6, "completed", 800, 0, 300, 0),
    # Chhattisgarh sales (buyer 4 = Annapurna Hotels Raipur)
    (12, 4, 500, 2, 8, "completed", 600, 250, 200, 0),
    (12, 4, 400, 1, 12, "completed", 500, 200, 150, 0),
    (15, 4, 200, 3, 5, "completed", 300, 100, 80, 0),
    (15, 4, 150, 0, 10, "accepted", 0, 0, 0, 0),
    (12, 4, 200, 0, 22, "pending", 0, 0, 0, 0),
]
DEMO_OTP = "4821"

# Buyer reviews on completed sales: (index into ORDERS, stars, comment)
REVIEWS = [
    (0, 5, "Export-quality grapes, exactly as listed. Packed well."),
    (1, 5, "Second order from Ramesh ji, consistent quality."),
    (3, 4, "Good grapes, one crate slightly soft."),
    (4, 5, "Sweet and fresh, our guests loved them."),
    (6, 4, "Firm tomatoes, delivered on time."),
    (12, 5, "Juicy Nagpur oranges, fair price."),
    (14, 4, "Good wheat, well cleaned."),
    (15, 5, "Crisp apples, great colour."),
    (16, 4, "Sweet watermelons, a few small ones."),
    (18, 5, "Bahut achhe tamatar, samay par delivery."),
    (19, 4, "Good quality, a few soft ones."),
    (20, 5, "Dubraj rice ki khushboo zabardast hai."),
]  # delivery OTP of the escrow demo orders (shown in the buyer's app)

# Flagged buyer's last week: 5 crops, 4 delivery PIN codes. (product index, qty, days ago, pincode, status)
FLAG_ORDERS = [
    (0, 100, 6, "422003", "rejected"),
    (2, 200, 5, "411001", "rejected"),
    (3, 150, 4, "440001", "rejected"),
    (4, 300, 3, "400703", "rejected"),
    (1, 50, 1, "422003", "pending"),
]


def _months_ago(now, months, day):
    m = now.month - 1 - months
    y = now.year + m // 12
    return datetime(y, m % 12 + 1, min(day, 28), 10, 0)


def seed_if_empty(db, User, Product, Requirement, Order=None, after=None, Review=None):
    """Insert demo data if there are no users yet. Returns True if seeded.
    `after` (optional) runs before the final commit, e.g. to build village pools."""
    if User.query.first():
        return False

    pw = generate_password_hash(PASSWORD)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    farmers = []
    for name, email, state, district, addr, pin, lang in FARMERS:
        u = User(name=name, email=email, password=pw, role="farmer", state=state, district=district,
                 address=addr, phone="9000000000", pincode=pin, language=lang)
        db.session.add(u)
        farmers.append(u)

    buyers = []
    for name, email, phone, state, district, addr, pin, btype, pan, fssai in BUYERS:
        u = User(name=name, email=email, password=pw, role="buyer", state=state, district=district,
                 address=addr, phone=phone, pincode=pin, business_type=btype, language="en",
                 gstin=make_gstin(STATE_CODE[state], pan) if pan else None, fssai_no=fssai,
                 kyb_verified=bool(pan), kyb_verified_at=now - timedelta(days=40) if pan else None)
        db.session.add(u)
        buyers.append(u)
    buyers[FLAGGED_BUYER].flagged_middleman = True
    buyers[FLAGGED_BUYER].flag_reason = ("Possible middleman: 5 different crops in 7 days and "
                                         "deliveries to 4 different PIN codes in 7 days")

    db.session.flush()

    products = []
    for fi, name, cat, price, qty, unit, mn, cost, desc, pool in PRODUCTS:
        f = farmers[fi]
        p = Product(
            farmer_id=f.id, name=name, category=cat, price=price, quantity=qty,
            unit=unit, minimum_order=mn, description=desc, cost_price=cost,
            season=guess_season(name), pincode=f.pincode, pool_enabled=pool,
            state=f.state, district=f.district, location=f.address)
        db.session.add(p)
        products.append(p)

    for bi, name, cat, qty, unit, lo, hi, days, desc in REQUIREMENTS:
        b = buyers[bi]
        db.session.add(Requirement(
            buyer_id=b.id, product_name=name, category=cat, quantity=qty, unit=unit,
            min_price=lo, max_price=hi, needed_within_days=days, description=desc,
            season=guess_season(name),
            state=b.state, district=b.district, location=b.address))

    db.session.flush()

    if Order is not None:
        seeded = []
        for pi, bi, qty, months, day, status, transport, packaging, labour, other in ORDERS:
            p, b = products[pi], buyers[bi]
            created = _months_ago(now, months, day)
            if created > now:
                created = now - timedelta(days=1)
            total = round(p.price * qty, 2)
            done = status == "completed"
            fee = round(total * PLATFORM_FEE_PERCENT / 100, 2)
            o = Order(
                buyer_id=b.id, farmer_id=p.farmer_id, product_id=p.id, quantity=qty,
                total_price=total, delivery_address=b.address, delivery_pincode=b.pincode, status=status,
                created_at=created, season=p.season, unit_cost=p.cost_price,
                completed_at=created + timedelta(days=2) if done else None,
                platform_fee=fee if done else None,
                transport_cost=transport if done else None,
                packaging_cost=packaging if done else None,
                labour_cost=labour if done else None,
                other_cost=other if done else None,
            )
            if done:
                o.escrow_status = "SETTLED_100"
                o.paid_at = created
                o.upi_ref = f"FHUPI{1000 + pi * 37 + bi:X}SEED"
                o.released_amount = round(total - fee, 2)
            elif status in ("accepted", "picked_up"):
                o.escrow_status = "LOCKED_100" if status == "accepted" else "RELEASED_70"
                o.paid_at = created
                o.upi_ref = f"FHUPI{2000 + pi * 37 + bi:X}SEED"
                o.delivery_otp = DEMO_OTP
                o.released_amount = 0.0 if status == "accepted" else round((total - fee) * 0.7, 2)
                o.picked_up_at = created + timedelta(days=1) if status == "picked_up" else None
            else:
                o.escrow_status = "UNPAID"
                o.released_amount = 0.0
            db.session.add(o)
            seeded.append(o)

        q = buyers[FLAGGED_BUYER]
        for pi, qty, days, pin, status in FLAG_ORDERS:
            p = products[pi]
            db.session.add(Order(
                buyer_id=q.id, farmer_id=p.farmer_id, product_id=p.id, quantity=qty,
                total_price=round(p.price * qty, 2), delivery_address="Various", delivery_pincode=pin,
                status=status, created_at=now - timedelta(days=days), season=p.season,
                unit_cost=p.cost_price, escrow_status="UNPAID", released_amount=0.0))

    db.session.flush()
    if Order is not None and Review is not None:
        for oi, stars, comment in REVIEWS:
            o = seeded[oi]
            if o.status == "completed":
                db.session.add(Review(order_id=o.id, buyer_id=o.buyer_id, farmer_id=o.farmer_id, rating=stars,
                                      comment=comment, created_at=o.completed_at))
        db.session.flush()
    if after:
        after()
    db.session.commit()
    return True
