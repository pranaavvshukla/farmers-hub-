"""Load demo data.
   python seed.py           -> adds demo data if the DB is empty
   python seed.py --reset   -> wipes the DB first, then adds demo data"""
import sys

from app import app, db, User, Product, Requirement, Order, Review, rebuild_pools
from demo_data import seed_if_empty, PASSWORD

with app.app_context():
    if "--reset" in sys.argv:
        db.drop_all()
    db.create_all()

    if seed_if_empty(db, User, Product, Requirement, Order, after=rebuild_pools, Review=Review):
        print("Seeded demo data.")
        print(f"Farmer: ramesh@farmhub.test | Buyer: buyer@farmhub.test | password: {PASSWORD}")
    else:
        print("DB already has data. Use --reset to wipe it first.")
