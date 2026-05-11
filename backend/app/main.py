from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import List, Dict, Any
import os
from datetime import datetime

# Import the files we just wrote
from . import models, algorithm

# Database Setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@db:5432/pocket")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Pocket - Expense Splitter API")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic Schemas
class UserCreate(BaseModel):
    name: str
    email: str

class GroupCreate(BaseModel):
    name: str

class GroupMemberAdd(BaseModel):
    user_id: str

class SplitCreate(BaseModel):
    user_id: str
    amount_owed: float

class ExpenseCreate(BaseModel):
    group_id: str
    payer_id: str
    description: str
    amount: float
    splits: List[SplitCreate]

class SettlementCreate(BaseModel):
    group_id: str
    payer_id: str
    receiver_id: str
    amount: float

# API Endpoints: Users & Groups
@app.post("/users/")
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = models.User(name=user.name, email=user.email)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return {"id": db_user.id, "name": db_user.name}

@app.post("/groups/")
def create_group(group: GroupCreate, db: Session = Depends(get_db)):
    db_group = models.Group(name=group.name)
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return {"id": db_group.id, "name": db_group.name}

@app.get("/groups/{group_id}")
def get_group_details(group_id: str, db: Session = Depends(get_db)):
    """Fetches group details and a list of its current members."""
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    return {
        "id": group.id,
        "name": group.name,
        "members": [{"id": m.id, "name": m.name} for m in group.members]
    }

@app.post("/groups/{group_id}/members")
def add_user_to_group(group_id: str, payload: GroupMemberAdd, db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    
    if not group or not user:
        raise HTTPException(status_code=404, detail="Group or User not found")
        
    group.members.append(user)
    db.commit()
    return {"message": f"Added {user.name} to {group.name}"}

# API Endpoints: The Ledger (Expenses & Settlements)
@app.post("/expenses/")
def create_expense(expense: ExpenseCreate, db: Session = Depends(get_db)):
    total_split = sum(split.amount_owed for split in expense.splits)
    if round(total_split, 2) != round(expense.amount, 2):
        raise HTTPException(status_code=400, detail="Splits must equal total amount")

    db_expense = models.Expense(
        group_id=expense.group_id,
        payer_id=expense.payer_id,
        description=expense.description,
        amount=expense.amount
    )
    db.add(db_expense)
    db.flush()

    for split in expense.splits:
        db_split = models.ExpenseSplit(
            expense_id=db_expense.id,
            user_id=split.user_id,
            amount_owed=split.amount_owed
        )
        db.add(db_split)

    db.commit()
    return {"message": "Expense recorded", "expense_id": db_expense.id}

@app.post("/settlements/")
def create_settlement(settlement: SettlementCreate, db: Session = Depends(get_db)):
    """Records a payment between two users to clear debt."""
    db_settlement = models.Settlement(
        group_id=settlement.group_id,
        payer_id=settlement.payer_id,
        receiver_id=settlement.receiver_id,
        amount=settlement.amount
    )
    db.add(db_settlement)
    db.commit()
    return {"message": "Settlement recorded"}

@app.get("/groups/{group_id}/feed")
def get_group_feed(group_id: str, db: Session = Depends(get_db)):
    """Returns a chronologically sorted audit trail of all expenses and settlements."""
    expenses = db.query(models.Expense).filter(models.Expense.group_id == group_id).all()
    settlements = db.query(models.Settlement).filter(models.Settlement.group_id == group_id).all()

    feed = []
    for e in expenses:
        feed.append({
            "type": "expense",
            "id": e.id,
            "description": e.description,
            "amount": e.amount,
            "payer_id": e.payer_id,
            "created_at": e.created_at
        })
    for s in settlements:
        feed.append({
            "type": "settlement",
            "id": s.id,
            "amount": s.amount,
            "payer_id": s.payer_id,
            "receiver_id": s.receiver_id,
            "created_at": s.created_at
        })

    # Sort by created_at descending (newest first)
    feed.sort(key=lambda x: x["created_at"], reverse=True)
    return {"feed": feed}

# API Endpoints: The Core Math Algorithm
@app.get("/groups/{group_id}/settlements")
def get_suggested_settlements(group_id: str, db: Session = Depends(get_db)):
    """Runs the Greedy Netting Algorithm, factoring in both expenses AND past settlements."""
    expenses = db.query(models.Expense).filter(models.Expense.group_id == group_id).all()
    settlements = db.query(models.Settlement).filter(models.Settlement.group_id == group_id).all()
    
    if not expenses:
        return {"settlements": []}

    expense_ids = [e.id for e in expenses]
    splits = db.query(models.ExpenseSplit).filter(models.ExpenseSplit.expense_id.in_(expense_ids)).all()

    expenses_data = [{"id": e.id, "payer_id": e.payer_id, "amount": e.amount} for e in expenses]
    splits_data = [{"expense_id": s.expense_id, "user_id": s.user_id, "amount_owed": s.amount_owed} for s in splits]

    # Treat past settlements as mini-expenses where the receiver "owes" the payer back.
    # This automatically deducts the settled amount from the algorithm's calculation!
    for s in settlements:
        expenses_data.append({"id": f"settlement_{s.id}", "payer_id": s.payer_id, "amount": s.amount})
        splits_data.append({"expense_id": f"settlement_{s.id}", "user_id": s.receiver_id, "amount_owed": s.amount})

    min_settlements = algorithm.calculate_min_settlements(expenses_data, splits_data)

    return {"settlements": min_settlements}