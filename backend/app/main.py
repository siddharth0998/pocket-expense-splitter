from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Response, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import List, Optional
import os
import csv
import io
import calendar
from pathlib import Path
from datetime import date

# Import the files we just wrote
from . import models, algorithm

# Database Setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@db:5432/pocket")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

models.Base.metadata.create_all(bind=engine)

def ensure_schema_compatibility():
    """Small no-migrations safety net for demo databases created before stretch tables."""
    inspector = inspect(engine)
    if "expenses" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("expenses")}
    column_sql = {
        "receipt_url": "VARCHAR",
        "receipt_filename": "VARCHAR",
        "recurring_template_id": "VARCHAR",
        "generated_for_month": "VARCHAR",
    }
    missing_columns = [name for name in column_sql if name not in existing_columns]
    
    group_columns = {column["name"] for column in inspector.get_columns("groups")}
    missing_group_columns = ["creator_id"] if "creator_id" not in group_columns else []

    with engine.begin() as connection:
        for column_name in missing_columns:
            connection.execute(text(f"ALTER TABLE expenses ADD COLUMN {column_name} {column_sql[column_name]}"))
        for column_name in missing_group_columns:
            connection.execute(text(f"ALTER TABLE groups ADD COLUMN creator_id VARCHAR"))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_expense_month "
            "ON expenses (recurring_template_id, generated_for_month) "
            "WHERE recurring_template_id IS NOT NULL AND generated_for_month IS NOT NULL"
        ))

ensure_schema_compatibility()

app = FastAPI(title="Pocket - Expense Splitter API")

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads")).resolve()
RECEIPT_DIR = UPLOAD_DIR / "receipts"
RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Get the allowed frontend URL from the environment, defaulting to localhost for dev
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# We create a list of allowed origins
origins = [
    "http://localhost:3000",  # Always allow local development
    FRONTEND_URL,             # Allow the production frontend
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

class RecurringExpenseCreate(ExpenseCreate):
    start_date: Optional[date] = None
    day_of_month: Optional[int] = None

class SettlementCreate(BaseModel):
    group_id: str
    payer_id: str
    receiver_id: str
    amount: float

def next_monthly_run(current_run: date, day_of_month: int) -> date:
    next_month = current_run.month + 1
    next_year = current_run.year
    if next_month == 13:
        next_month = 1
        next_year += 1
    last_day = calendar.monthrange(next_year, next_month)[1]
    return date(next_year, next_month, min(day_of_month, last_day))

def first_monthly_run(start: date, day_of_month: int) -> date:
    last_day = calendar.monthrange(start.year, start.month)[1]
    run_on = date(start.year, start.month, min(day_of_month, last_day))
    if run_on < start:
        return next_monthly_run(run_on, day_of_month)
    return run_on

def validate_ledger_payload(payload: ExpenseCreate, db: Session):
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    group = db.query(models.Group).filter(models.Group.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    member_ids = {m.id for m in group.members}
    if payload.payer_id not in member_ids:
        raise HTTPException(status_code=400, detail="Payer is not in the group")

    for split in payload.splits:
        if split.user_id not in member_ids:
            raise HTTPException(status_code=400, detail=f"User {split.user_id} is not in the group")
        if split.amount_owed < 0:
            raise HTTPException(status_code=400, detail="Split amounts cannot be negative")

    total_split = sum(split.amount_owed for split in payload.splits)
    if round(total_split, 2) != round(payload.amount, 2):
        raise HTTPException(status_code=400, detail="Splits must equal total amount")

    return group

def create_expense_rows(
    db: Session,
    *,
    group_id: str,
    payer_id: str,
    description: str,
    amount: float,
    splits: List[SplitCreate],
    recurring_template_id: Optional[str] = None,
    generated_for_month: Optional[str] = None,
):
    db_expense = models.Expense(
        group_id=group_id,
        payer_id=payer_id,
        description=description,
        amount=amount,
        recurring_template_id=recurring_template_id,
        generated_for_month=generated_for_month,
    )
    db.add(db_expense)
    db.flush()

    for split in splits:
        db.add(models.ExpenseSplit(
            expense_id=db_expense.id,
            user_id=split.user_id,
            amount_owed=split.amount_owed,
        ))

    return db_expense

def process_due_recurring_expenses(group_id: str, db: Session) -> int:
    today = date.today()
    generated_count = 0
    templates = db.query(models.RecurringExpenseTemplate).filter(
        models.RecurringExpenseTemplate.group_id == group_id,
        models.RecurringExpenseTemplate.is_active == True,
    ).all()

    for template in templates:
        while template.next_run_on <= today:
            month_key = template.next_run_on.strftime("%Y-%m")
            existing = db.query(models.Expense).filter(
                models.Expense.recurring_template_id == template.id,
                models.Expense.generated_for_month == month_key,
            ).first()

            if not existing:
                splits = [
                    SplitCreate(user_id=split.user_id, amount_owed=float(split.amount_owed))
                    for split in template.splits
                ]
                create_expense_rows(
                    db,
                    group_id=template.group_id,
                    payer_id=template.payer_id,
                    description=f"{template.description} ({month_key})",
                    amount=float(template.amount),
                    splits=splits,
                    recurring_template_id=template.id,
                    generated_for_month=month_key,
                )
                generated_count += 1

            template.next_run_on = next_monthly_run(template.next_run_on, template.day_of_month)

    if generated_count:
        db.commit()

    return generated_count

# API Endpoints: Users & Groups
@app.post("/users/")
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(models.User.email == user.email).first()
    if existing_user:
        return {"id": existing_user.id, "name": existing_user.name}

    db_user = models.User(name=user.name, email=user.email)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return {"id": db_user.id, "name": db_user.name}

@app.post("/groups/")
def create_group(group: GroupCreate, x_user_id: Optional[str] = Header(None), db: Session = Depends(get_db)):
    db_group = models.Group(name=group.name, creator_id=x_user_id)
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    
    # If the creator exists, automatically add them as a member
    if x_user_id:
        user = db.query(models.User).filter(models.User.id == x_user_id).first()
        if user:
            db_group.members.append(user)
            db.commit()
            
    return {"id": db_group.id, "name": db_group.name}

@app.get("/groups/")
def get_all_groups(db: Session = Depends(get_db)):
    """Fetches all existing groups."""
    groups = db.query(models.Group).all()
    return [{"id": g.id, "name": g.name, "currency": g.currency} for g in groups]

def require_group_access(group_id: str, x_user_id: Optional[str] = Header(None), db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    if group.creator_id is None:
        return group
        
    if not x_user_id:
        raise HTTPException(status_code=403, detail="Access Denied: Please identify yourself to view this group.")
        
    if x_user_id == group.creator_id:
        return group
        
    member_ids = [m.id for m in group.members]
    if x_user_id in member_ids:
        return group
        
    raise HTTPException(status_code=403, detail="Access Denied: You are not a member of this private group.")

@app.get("/groups/{group_id}")
def get_group_details(group_id: str, db: Session = Depends(get_db), _ = Depends(require_group_access)):
    """Fetches group details and a list of its current members."""
    process_due_recurring_expenses(group_id, db)
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    return {
        "id": group.id,
        "name": group.name,
        "members": [{"id": m.id, "name": m.name} for m in group.members]
    }

@app.post("/groups/{group_id}/members")
def add_user_to_group(group_id: str, payload: GroupMemberAdd, db: Session = Depends(get_db), _ = Depends(require_group_access)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    
    if not group or not user:
        raise HTTPException(status_code=404, detail="Group or User not found")
        
    group.members.append(user)
    db.commit()
    return {"message": f"Added {user.name} to {group.name}"}

@app.delete("/groups/{group_id}/members/{user_id}")
def remove_user_from_group(group_id: str, user_id: str, db: Session = Depends(get_db), _ = Depends(require_group_access)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    user = db.query(models.User).filter(models.User.id == user_id).first()
    
    if not group or not user:
        raise HTTPException(status_code=404, detail="Group or User not found")
        
    if user not in group.members:
        raise HTTPException(status_code=400, detail="User is not a member of this group")

    # Calculate net balance to ensure they don't owe or aren't owed money
    expenses = db.query(models.Expense).filter(models.Expense.group_id == group_id, models.Expense.is_deleted == False).all()
    settlements = db.query(models.Settlement).filter(models.Settlement.group_id == group_id, models.Settlement.is_deleted == False).all()
    
    balance = 0.0
    for ex in expenses:
        if ex.payer_id == user_id:
            balance += ex.amount
        for split in ex.splits:
            if split.user_id == user_id:
                balance -= split.amount_owed
                
    for st in settlements:
        if st.payer_id == user_id:
            balance += st.amount
        if st.receiver_id == user_id:
            balance -= st.amount
            
    if abs(balance) > 0.01:
        raise HTTPException(status_code=400, detail="Cannot leave group with an unsettled balance. Please settle up first.")
        
    group.members.remove(user)
    db.commit()
    return {"message": f"Removed {user.name} from {group.name}"}

@app.delete("/groups/{group_id}")
def delete_group(group_id: str, db: Session = Depends(get_db), _ = Depends(require_group_access)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    expenses = db.query(models.Expense).filter(models.Expense.group_id == group_id, models.Expense.is_deleted == False).all()
    settlements = db.query(models.Settlement).filter(models.Settlement.group_id == group_id, models.Settlement.is_deleted == False).all()
    
    if expenses:
        expense_ids = [e.id for e in expenses]
        splits = db.query(models.ExpenseSplit).filter(models.ExpenseSplit.expense_id.in_(expense_ids)).all()
        
        expenses_data = [{"id": e.id, "payer_id": e.payer_id, "amount": e.amount} for e in expenses]
        splits_data = [{"expense_id": s.expense_id, "user_id": s.user_id, "amount_owed": s.amount_owed} for s in splits]
        
        for s in settlements:
            expenses_data.append({"id": f"settlement_{s.id}", "payer_id": s.payer_id, "amount": s.amount})
            splits_data.append({"expense_id": f"settlement_{s.id}", "user_id": s.receiver_id, "amount_owed": s.amount})
            
        min_settlements = algorithm.calculate_min_settlements(expenses_data, splits_data)
        
        if len(min_settlements) > 0:
            raise HTTPException(status_code=400, detail="Cannot delete group. There are still unsettled debts!")

    db.delete(group)
    db.commit()
    return {"message": "Group deleted"}

# API Endpoints: The Ledger (Expenses & Settlements)
@app.post("/expenses/")
def create_expense(expense: ExpenseCreate, db: Session = Depends(get_db)):
    validate_ledger_payload(expense, db)
    db_expense = create_expense_rows(
        db,
        group_id=expense.group_id,
        payer_id=expense.payer_id,
        description=expense.description,
        amount=expense.amount,
        splits=expense.splits,
    )
    db.commit()
    return {"message": "Expense recorded", "expense_id": db_expense.id}

@app.post("/expenses/{expense_id}/receipt")
def upload_receipt(expense_id: str, receipt: UploadFile = File(...), db: Session = Depends(get_db)):
    expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.is_deleted == False,
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if not receipt.content_type or not receipt.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Receipt must be an image")

    suffix = Path(receipt.filename or "").suffix.lower() or ".jpg"
    filename = f"{expense_id}{suffix}"
    destination = RECEIPT_DIR / filename
    with destination.open("wb") as buffer:
        buffer.write(receipt.file.read())

    expense.receipt_filename = receipt.filename
    expense.receipt_url = f"/uploads/receipts/{filename}"
    db.commit()
    return {"message": "Receipt uploaded", "receipt_url": expense.receipt_url}

@app.post("/recurring-expenses/")
def create_recurring_expense(template: RecurringExpenseCreate, db: Session = Depends(get_db)):
    validate_ledger_payload(template, db)

    start = template.start_date or date.today()
    day_of_month = template.day_of_month or start.day
    if day_of_month < 1 or day_of_month > 31:
        raise HTTPException(status_code=400, detail="day_of_month must be between 1 and 31")

    db_template = models.RecurringExpenseTemplate(
        group_id=template.group_id,
        payer_id=template.payer_id,
        description=template.description,
        amount=template.amount,
        day_of_month=day_of_month,
        next_run_on=first_monthly_run(start, day_of_month),
    )
    db.add(db_template)
    db.flush()

    for split in template.splits:
        db.add(models.RecurringExpenseSplit(
            template_id=db_template.id,
            user_id=split.user_id,
            amount_owed=split.amount_owed,
        ))

    db.commit()
    generated_count = process_due_recurring_expenses(template.group_id, db)
    return {
        "message": "Recurring expense created",
        "template_id": db_template.id,
        "generated_count": generated_count,
    }

@app.get("/groups/{group_id}/recurring-expenses")
def get_group_recurring_expenses(group_id: str, db: Session = Depends(get_db), _ = Depends(require_group_access)):
    process_due_recurring_expenses(group_id, db)
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    templates = db.query(models.RecurringExpenseTemplate).filter(
        models.RecurringExpenseTemplate.group_id == group_id,
        models.RecurringExpenseTemplate.is_active == True,
    ).order_by(models.RecurringExpenseTemplate.created_at.desc()).all()
    user_names = {m.id: m.name for m in group.members}
    return {
        "recurring_expenses": [
            {
                "id": template.id,
                "description": template.description,
                "amount": float(template.amount),
                "payer_id": template.payer_id,
                "payer_name": user_names.get(template.payer_id, "Unknown"),
                "day_of_month": template.day_of_month,
                "next_run_on": template.next_run_on,
                "created_at": template.created_at,
            }
            for template in templates
        ]
    }

@app.delete("/expenses/{expense_id}")
def delete_expense(expense_id: str, db: Session = Depends(get_db)):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    expense.is_deleted = True
    db.commit()
    return {"message": "Expense deleted"}

@app.post("/settlements/")
def create_settlement(settlement: SettlementCreate, db: Session = Depends(get_db)):
    """Records a payment between two users to clear debt."""
    if settlement.payer_id == settlement.receiver_id:
        raise HTTPException(status_code=400, detail="Payer and receiver cannot be the same")
    if settlement.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    group = db.query(models.Group).filter(models.Group.id == settlement.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    member_ids = {m.id for m in group.members}
    if settlement.payer_id not in member_ids or settlement.receiver_id not in member_ids:
        raise HTTPException(status_code=400, detail="Both settlement users must be in the group")

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
def get_group_feed(group_id: str, db: Session = Depends(get_db), _ = Depends(require_group_access)):
    """Returns a chronologically sorted audit trail of all expenses and settlements."""
    process_due_recurring_expenses(group_id, db)
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    user_names = {m.id: m.name for m in group.members}
    expenses = db.query(models.Expense).filter(models.Expense.group_id == group_id, models.Expense.is_deleted == False).all()
    settlements = db.query(models.Settlement).filter(models.Settlement.group_id == group_id, models.Settlement.is_deleted == False).all()

    feed = []
    for e in expenses:
        feed.append({
            "type": "expense",
            "id": e.id,
            "description": e.description,
            "amount": float(e.amount),
            "payer_id": e.payer_id,
            "payer_name": user_names.get(e.payer_id, "Unknown"),
            "receipt_url": e.receipt_url,
            "receipt_filename": e.receipt_filename,
            "recurring_template_id": e.recurring_template_id,
            "generated_for_month": e.generated_for_month,
            "created_at": e.created_at
        })
    for s in settlements:
        feed.append({
            "type": "settlement",
            "id": s.id,
            "description": f"Payment from {user_names.get(s.payer_id, 'Unknown')} to {user_names.get(s.receiver_id, 'Unknown')}",
            "amount": float(s.amount),
            "payer_id": s.payer_id,
            "payer_name": user_names.get(s.payer_id, "Unknown"),
            "receiver_id": s.receiver_id,
            "receiver_name": user_names.get(s.receiver_id, "Unknown"),
            "receipt_url": None,
            "receipt_filename": None,
            "recurring_template_id": None,
            "generated_for_month": None,
            "created_at": s.created_at
        })

    # Sort by created_at descending (newest first)
    feed.sort(key=lambda x: x["created_at"], reverse=True)
    return {"feed": feed}

# API Endpoints: The Core Math Algorithm
@app.get("/groups/{group_id}/settlements")
def get_suggested_settlements(group_id: str, db: Session = Depends(get_db), _ = Depends(require_group_access)):
    """Runs the Greedy Netting Algorithm, factoring in both expenses AND past settlements."""
    process_due_recurring_expenses(group_id, db)
    expenses = db.query(models.Expense).filter(models.Expense.group_id == group_id, models.Expense.is_deleted == False).all()
    settlements = db.query(models.Settlement).filter(models.Settlement.group_id == group_id, models.Settlement.is_deleted == False).all()
    
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

    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    user_names = {m.id: m.name for m in group.members} if group else {}

    result = []
    for s in min_settlements:
        result.append({
            "payer_id": s.payer_id,
            "payer_name": user_names.get(s.payer_id, "Unknown"),
            "receiver_id": s.receiver_id,
            "receiver_name": user_names.get(s.receiver_id, "Unknown"),
            "amount": s.amount
        })

    return {"settlements": result}

@app.get("/groups/{group_id}/export.csv")
def export_group_csv(group_id: str, db: Session = Depends(get_db), _ = Depends(require_group_access)):
    """Exports the group's audit trail as CSV."""
    process_due_recurring_expenses(group_id, db)
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    user_names = {m.id: m.name for m in group.members}
    expenses = db.query(models.Expense).filter(models.Expense.group_id == group_id, models.Expense.is_deleted == False).all()
    settlements = db.query(models.Settlement).filter(models.Settlement.group_id == group_id, models.Settlement.is_deleted == False).all()

    rows = []
    for expense in expenses:
        rows.append({
            "created_at": expense.created_at,
            "type": "expense",
            "description": expense.description,
            "amount": float(expense.amount),
            "payer": user_names.get(expense.payer_id, "Unknown"),
            "receiver": "",
            "receipt_url": expense.receipt_url or "",
            "recurring_month": expense.generated_for_month or "",
        })
    for settlement in settlements:
        rows.append({
            "created_at": settlement.created_at,
            "type": "settlement",
            "description": "Settle up payment",
            "amount": float(settlement.amount),
            "payer": user_names.get(settlement.payer_id, "Unknown"),
            "receiver": user_names.get(settlement.receiver_id, "Unknown"),
            "receipt_url": "",
            "recurring_month": "",
        })

    rows.sort(key=lambda row: row["created_at"])

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["date", "type", "description", "amount", "payer", "receiver", "receipt_url", "recurring_month"])
    for row in rows:
        writer.writerow([
            row["created_at"].isoformat(),
            row["type"],
            row["description"],
            f"{row['amount']:.2f}",
            row["payer"],
            row["receiver"],
            row["receipt_url"],
            row["recurring_month"],
        ])

    safe_group_name = "".join(char if char.isalnum() else "-" for char in group.name.lower()).strip("-") or "group"
    headers = {"Content-Disposition": f'attachment; filename="{safe_group_name}-activity.csv"'}
    return Response(content=output.getvalue(), media_type="text/csv", headers=headers)
