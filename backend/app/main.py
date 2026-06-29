from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Response, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import List, Optional, Any
import os
import csv
import io
import calendar
from pathlib import Path
from datetime import date, datetime, timedelta
import random
import smtplib
from email.message import EmailMessage
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# Import the files we just wrote
from . import models, algorithm

# Database Setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@db:5432/splitvero")

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
        "creator_id": "VARCHAR",
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

app = FastAPI(title="Splitvero - Expense Splitter API")

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

class UserUpdate(BaseModel):
    name: str

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

def validate_ledger_payload(payload: Any, db: Session, x_user_id: str):
    if not x_user_id:
        raise HTTPException(status_code=403, detail="Unauthenticated request")
    if hasattr(payload, 'amount') and payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    group = db.query(models.Group).filter(models.Group.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    member_ids = {m.id for m in group.members}
    if x_user_id not in member_ids:
        raise HTTPException(status_code=403, detail="You must be a member of this group to modify the ledger")
        
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
    splits: list[SplitCreate],
    creator_id: Optional[str] = None,
    recurring_template_id: Optional[str] = None,
    generated_for_month: Optional[str] = None,
) -> models.Expense:
    db_expense = models.Expense(
        group_id=group_id,
        payer_id=payer_id,
        creator_id=creator_id,
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
class GoogleLoginPayload(BaseModel):
    credential: str

class OTPRequest(BaseModel):
    email: str

class OTPVerify(BaseModel):
    email: str
    code: str
    name: Optional[str] = None

def send_email(to_email: str, subject: str, html_content: str):
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASSWORD")
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_from = os.getenv("SMTP_FROM_EMAIL", smtp_user)

    if not smtp_user or not smtp_pass:
        print(f"--- EMAIL MOCK ---")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Content: {html_content}")
        print(f"------------------")
        return

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f"Splitvero App <{smtp_from}>"
    msg['To'] = to_email
    msg.set_content("Please enable HTML to view this email.")
    msg.add_alternative(html_content, subtype='html')

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
    except Exception as e:
        print(f"Failed to send email: {e}")

@app.post("/users/request-otp")
def request_otp(payload: OTPRequest, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    if not email:
        raise HTTPException(400, "Email required")
    
    code = f"{random.randint(100000, 999999)}"
    expires_at = datetime.utcnow() + timedelta(minutes=10)
    
    otp_record = db.query(models.UserOTP).filter(models.UserOTP.email == email).first()
    if otp_record:
        otp_record.otp_code = code
        otp_record.expires_at = expires_at
    else:
        otp_record = models.UserOTP(email=email, otp_code=code, expires_at=expires_at)
        db.add(otp_record)
        
    db.commit()
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <title>Splitvero Verification</title>
    </head>
    <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 0;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden;">
            <tr>
                <td style="padding: 40px 40px 20px 40px; text-align: center; background-color: #4f46e5;">
                    <img src="https://splitvero.com/logo.png" alt="Splitvero Logo" width="64" style="display: block; margin: 0 auto; margin-bottom: 16px;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Splitvero</h1>
                </td>
            </tr>
            <tr>
                <td style="padding: 40px;">
                    <h2 style="color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 20px;">Sign in to your account</h2>
                    <p style="color: #52525b; font-size: 16px; line-height: 1.5; margin-bottom: 30px;">
                        Use the secure verification code below to access your Splitvero Expense Splitter account. This code is unique to you.
                    </p>
                    
                    <div style="background-color: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 30px;">
                        <span style="font-family: monospace; font-size: 36px; font-weight: 700; color: #4f46e5; letter-spacing: 8px;">{code}</span>
                    </div>
                    
                    <p style="color: #71717a; font-size: 14px; margin-bottom: 0;">
                        This code will expire securely in 10 minutes. If you did not request this email, you can safely ignore it.
                    </p>
                </td>
            </tr>
            <tr>
                <td style="padding: 20px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; text-align: center;">
                    <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
                        &copy; 2026 Splitvero Expense Splitter. All rights reserved.
                    </p>
                </td>
        </table>
    </body>
    </html>
    """
    
    # Check if we are in local dev via docker-compose.override.yml
    is_dev = os.getenv("IS_LOCAL_DEV") == "true"
    
    if is_dev:
        print(f"=====================================")
        print(f"DEVELOPMENT MODE: OTP for {email} is {code}")
        print(f"=====================================")
    else:
        send_email(email, "Splitvero Verification Code", html)
        
    return {"message": "OTP sent"}

@app.post("/users/verify-otp")
def verify_otp(payload: OTPVerify, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    code = payload.code.strip()
    
    # Check for local development bypass
    is_dev = os.getenv("IS_LOCAL_DEV") == "true"
    
    otp_record = db.query(models.UserOTP).filter(models.UserOTP.email == email).first()
    
    if is_dev and code == "123456":
        # Master bypass for dev
        pass
    else:
        if not otp_record or otp_record.otp_code != code:
            raise HTTPException(401, "Invalid or expired verification code")
            
        if otp_record.expires_at < datetime.utcnow():
            raise HTTPException(401, "Verification code has expired")
        

    # Valid! Find or create user.
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        derived_name = payload.name if payload.name else email.split('@')[0].capitalize()
        user = models.User(name=derived_name, email=email)
        db.add(user)
        db.commit()
        db.refresh(user)
        
    # Clear OTP
    db.delete(otp_record)
    db.commit()
    
    return {"id": user.id, "name": user.name}

@app.post("/users/google-login")
def google_login(payload: GoogleLoginPayload, db: Session = Depends(get_db)):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(500, "Server not configured for Google Sign-In")
        
    try:
        idinfo = id_token.verify_oauth2_token(payload.credential, google_requests.Request(), client_id)
        email = idinfo['email'].lower()
        name = idinfo.get('name', email.split('@')[0])
        
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            user = models.User(name=name, email=email)
            db.add(user)
            db.commit()
            db.refresh(user)
            
        return {"id": user.id, "name": user.name}
    except ValueError:
        raise HTTPException(401, "Invalid Google token")

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

@app.put("/users/{user_id}")
def update_user(user_id: str, user_update: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.name = user_update.name
    db.commit()
    db.refresh(user)
    return {"id": user.id, "name": user.name}

@app.post("/groups/")
def create_group(group: GroupCreate, x_user_id: Optional[str] = Header(None), db: Session = Depends(get_db)):
    import re
    import uuid
    # Generate friendly slug
    slug = re.sub(r'[^a-zA-Z0-9\s-]', '', group.name).strip()
    slug = re.sub(r'[\s-]+', '-', slug).lower()
    if not slug:
        slug = "group"
    group_id = f"{slug}-{uuid.uuid4().hex[:6]}"
    
    db_group = models.Group(id=group_id, name=group.name, creator_id=x_user_id)
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
def get_all_groups(x_user_id: Optional[str] = Header(None), db: Session = Depends(get_db)):
    """Fetches all existing groups that the user is a part of."""
    if not x_user_id:
        return []
        
    groups = db.query(models.Group).all()
    user_groups = []
    
    for g in groups:
        is_member = any(m.id == x_user_id for m in g.members)
        if is_member:
            user_groups.append({"id": g.id, "name": g.name, "currency": g.currency})
            
    return user_groups

def require_group_access(group_id: str, x_user_id: Optional[str] = Header(None), db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    if group.creator_id is None:
        return group
        
    if not x_user_id:
        raise HTTPException(status_code=403, detail="Access Denied: Please identify yourself to view this group.")
        
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
        "creator_id": group.creator_id,
        "members": [{"id": m.id, "name": m.name} for m in group.members]
    }

INVITE_RATE_LIMIT = {}

@app.post("/groups/{group_id}/members")
def add_user_to_group(group_id: str, payload: GroupMemberAdd, db: Session = Depends(get_db), _ = Depends(require_group_access)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    
    if not group or not user:
        raise HTTPException(status_code=404, detail="Group or User not found")
        
    if user not in group.members:
        group.members.append(user)
        db.commit()

        # Rate Limited Email Invitation (1 per hour per email)
        now = datetime.utcnow()
        last_sent = INVITE_RATE_LIMIT.get(user.email)
        if not last_sent or (now - last_sent) > timedelta(hours=1):
            INVITE_RATE_LIMIT[user.email] = now
            html_content = f"""
            <div style="font-family: sans-serif; padding: 20px;">
                <h2>You've been added to a group!</h2>
                <p>You were just added to the group <b>{group.name}</b> on Splitvero.</p>
                <p>Log in with this email address to view the ledger and settle up your expenses.</p>
            </div>
            """
            send_email(user.email, f"You were added to {group.name}", html_content)

    return {"message": f"Added {user.name} to {group.name}"}

@app.delete("/groups/{group_id}/members/{user_id}")
def remove_user_from_group(group_id: str, user_id: str, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(None)):
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
    
    # If the group is now empty, delete it
    if len(group.members) == 0:
        db.delete(group)
        db.commit()
        return {"message": f"Removed {user.name} and deleted empty group '{group.name}'"}
        
    db.commit()
    return {"message": f"Removed {user.name} from {group.name}"}

@app.delete("/groups/{group_id}")
def delete_group(group_id: str, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(None)):
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
def create_expense(expense: ExpenseCreate, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(None)):
    validate_ledger_payload(expense, db, x_user_id)
    db_expense = create_expense_rows(
        db,
        group_id=expense.group_id,
        payer_id=expense.payer_id,
        description=expense.description,
        amount=expense.amount,
        splits=expense.splits,
        creator_id=x_user_id,
    )
    db.commit()
    return {"message": "Expense recorded", "expense_id": db_expense.id}

@app.post("/expenses/{expense_id}/receipt")
def upload_receipt(expense_id: str, receipt: UploadFile = File(...), db: Session = Depends(get_db), x_user_id: Optional[str] = Header(None)):
    expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.is_deleted == False,
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
        
    group = db.query(models.Group).filter(models.Group.id == expense.group_id).first()
    if not group or x_user_id not in [m.id for m in group.members]:
        raise HTTPException(status_code=403, detail="Unauthorized")
        
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
def create_recurring_expense(template: RecurringExpenseCreate, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(None)):
    validate_ledger_payload(template, db, x_user_id)

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
def delete_expense(expense_id: str, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(None)):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
        
    group = db.query(models.Group).filter(models.Group.id == expense.group_id).first()
    if not group or x_user_id not in [m.id for m in group.members]:
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    # Check if the user is the creator (or payer for grandfathered expenses)
    if expense.creator_id:
        if expense.creator_id != x_user_id:
            raise HTTPException(status_code=403, detail="Only the person who created this expense can delete it")
    else:
        # Fallback for old expenses before creator_id was added
        if expense.payer_id != x_user_id:
            raise HTTPException(status_code=403, detail="Only the person who created this expense can delete it")
            
    # Lock the expense if a settlement has occurred since it was created
    has_settlement = db.query(models.Settlement).filter(
        models.Settlement.group_id == expense.group_id,
        models.Settlement.created_at >= expense.created_at,
        models.Settlement.is_deleted == False
    ).first()
    
    if has_settlement:
        raise HTTPException(status_code=400, detail="This expense is locked because a settlement has been made since it was created.")
    
    expense.is_deleted = True
    db.commit()
    return {"message": "Expense deleted"}

@app.post("/settlements/")
def create_settlement(settlement: SettlementCreate, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(None)):
    """Records a payment between two users to clear debt."""
    if not x_user_id:
        raise HTTPException(status_code=403, detail="Unauthenticated")
        
    if settlement.payer_id == settlement.receiver_id:
        raise HTTPException(status_code=400, detail="Payer and receiver cannot be the same")
    if settlement.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    group = db.query(models.Group).filter(models.Group.id == settlement.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    member_ids = {m.id for m in group.members}
    if x_user_id not in member_ids:
        raise HTTPException(status_code=403, detail="Unauthorized to settle in this group")
        
    if x_user_id != settlement.payer_id and x_user_id != settlement.receiver_id:
        raise HTTPException(status_code=403, detail="You can only settle your own debts")
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

    latest_settlement = db.query(models.Settlement).filter(models.Settlement.group_id == group_id, models.Settlement.is_deleted == False).order_by(models.Settlement.created_at.desc()).first()
    latest_settlement_date = latest_settlement.created_at if latest_settlement else None

    feed = []
    for e in expenses:
        is_locked = bool(latest_settlement_date and e.created_at <= latest_settlement_date)
        feed.append({
            "type": "expense",
            "id": e.id,
            "description": e.description,
            "amount": float(e.amount),
            "payer_id": e.payer_id,
            "payer_name": user_names.get(e.payer_id, "Unknown"),
            "creator_id": e.creator_id,
            "receipt_url": e.receipt_url,
            "receipt_filename": e.receipt_filename,
            "recurring_template_id": e.recurring_template_id,
            "generated_for_month": e.generated_for_month,
            "created_at": e.created_at.isoformat() + "Z",
            "is_locked": is_locked
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
            "created_at": s.created_at.isoformat() + "Z"
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
