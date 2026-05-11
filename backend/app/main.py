from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import List, Dict
import os

# Import the files we just wrote
from . import models, algorithm

# Database Setup (Will connect to the Docker Postgres)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@db:5432/pocket")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create tables (In a real app you'd use Alembic migrations, 
# but this is perfect for a 1-day case study build)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Pocket - Expense Splitter API")

# Dependency to get the database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic Schemas (For validating incoming JSON from Next.js)
class SplitCreate(BaseModel):
    user_id: str
    amount_owed: float

class ExpenseCreate(BaseModel):
    group_id: str
    payer_id: str
    description: str
    amount: float
    splits: List[SplitCreate]

# API Endpoints

@app.post("/expenses/", response_model=dict)
def create_expense(expense: ExpenseCreate, db: Session = Depends(get_db)):
    """
    Adds a new expense and its exact splits to the double-entry ledger.
    """
    # 1. Validate the math (Prevent bad data from entering the ledger)
    total_split = sum(split.amount_owed for split in expense.splits)
    if round(total_split, 2) != round(expense.amount, 2):
        raise HTTPException(status_code=400, detail="Splits must equal total amount")

    # 2. Create the parent expense
    db_expense = models.Expense(
        group_id=expense.group_id,
        payer_id=expense.payer_id,
        description=expense.description,
        amount=expense.amount
    )
    db.add(db_expense)
    db.flush() # Get the new expense ID without committing yet

    # 3. Create the unequal splits
    for split in expense.splits:
        db_split = models.ExpenseSplit(
            expense_id=db_expense.id,
            user_id=split.user_id,
            amount_owed=split.amount_owed
        )
        db.add(db_split)

    db.commit()
    return {"message": "Expense and splits recorded successfully", "expense_id": db_expense.id}


@app.get("/groups/{group_id}/settlements")
def get_settlements(group_id: str, db: Session = Depends(get_db)):
    """
    The magic endpoint. Fetches ledger data and runs the Greedy Netting Algorithm.
    """
    # 1. Fetch all expenses for this group
    expenses = db.query(models.Expense).filter(models.Expense.group_id == group_id).all()
    if not expenses:
        return {"settlements": []}

    expense_ids = [e.id for e in expenses]

    # 2. Fetch all splits related to those expenses
    splits = db.query(models.ExpenseSplit).filter(models.ExpenseSplit.expense_id.in_(expense_ids)).all()

    # 3. Format the data for our isolated algorithm
    expenses_data = [{"id": e.id, "payer_id": e.payer_id, "amount": e.amount} for e in expenses]
    splits_data = [{"expense_id": s.expense_id, "user_id": s.user_id, "amount_owed": s.amount_owed} for s in splits]

    # 4. Run the core math!
    min_settlements = algorithm.calculate_min_settlements(expenses_data, splits_data)

    return {"settlements": min_settlements}