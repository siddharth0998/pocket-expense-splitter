from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Response, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import List, Optional, Any
import os
import csv
import io
import calendar
import base64
import hashlib
import hmac
import json
import math
from pathlib import Path
from datetime import date, datetime, timedelta
from decimal import Decimal
import secrets
import smtplib
import time
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

AUTH_SECRET = os.getenv("AUTH_SECRET") or os.getenv("SECRET_KEY")
if not AUTH_SECRET:
    AUTH_SECRET = secrets.token_urlsafe(48)
    print("WARNING: AUTH_SECRET is not configured. Tokens will be invalidated when this process restarts.")

AUTH_TOKEN_TTL_SECONDS = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", str(60 * 60 * 24 * 30)))
OTP_REQUEST_COOLDOWN_SECONDS = int(os.getenv("OTP_REQUEST_COOLDOWN_SECONDS", "60"))
OTP_REQUEST_WINDOW_SECONDS = int(os.getenv("OTP_REQUEST_WINDOW_SECONDS", str(60 * 60)))
OTP_REQUEST_MAX_PER_WINDOW = int(os.getenv("OTP_REQUEST_MAX_PER_WINDOW", "5"))
OTP_VERIFY_WINDOW_SECONDS = int(os.getenv("OTP_VERIFY_WINDOW_SECONDS", str(10 * 60)))
OTP_VERIFY_MAX_PER_WINDOW = int(os.getenv("OTP_VERIFY_MAX_PER_WINDOW", "8"))
MAX_RECEIPT_BYTES = int(os.getenv("MAX_RECEIPT_BYTES", str(5 * 1024 * 1024)))
MAX_RECURRING_BACKFILL_MONTHS = int(os.getenv("MAX_RECURRING_BACKFILL_MONTHS", "6"))
MAX_RECURRING_GENERATIONS_PER_TEMPLATE = int(os.getenv("MAX_RECURRING_GENERATIONS_PER_TEMPLATE", "36"))

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

def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")

def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))

def create_auth_token(user: models.User) -> str:
    now = int(time.time())
    payload = {
        "sub": user.id,
        "iat": now,
        "exp": now + AUTH_TOKEN_TTL_SECONDS,
    }
    body = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(AUTH_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{_b64url_encode(signature)}"

def verify_auth_token(token: str) -> str:
    try:
        body, supplied_signature = token.split(".", 1)
        expected_signature = hmac.new(AUTH_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
        supplied_signature_bytes = _b64url_decode(supplied_signature)
        if not hmac.compare_digest(expected_signature, supplied_signature_bytes):
            raise ValueError("Bad token signature")
        payload = json.loads(_b64url_decode(body))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("Expired token")
        user_id = payload.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise ValueError("Missing token subject")
        return user_id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

def get_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    return token.strip()

def get_optional_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[models.User]:
    token = get_bearer_token(authorization)
    if not token:
        return None
    user_id = verify_auth_token(token)
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Session user no longer exists")
    return user

def get_current_user(current_user: Optional[models.User] = Depends(get_optional_current_user)) -> models.User:
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return current_user

def auth_user_response(user: models.User):
    return {"id": user.id, "name": user.name, "token": create_auth_token(user)}

def hash_otp(email: str, code: str) -> str:
    return hmac.new(AUTH_SECRET.encode("utf-8"), f"{email}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()

def prune_timestamps(timestamps: list[datetime], now: datetime, window_seconds: int) -> list[datetime]:
    cutoff = now - timedelta(seconds=window_seconds)
    return [timestamp for timestamp in timestamps if timestamp > cutoff]

def require_group_member(
    group_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Group:
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    member_ids = {member.id for member in group.members}
    if current_user.id not in member_ids:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    return group

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

def estimated_monthly_runs(first_run: date, through: date) -> int:
    if first_run > through:
        return 0
    return (through.year - first_run.year) * 12 + through.month - first_run.month + 1

def detect_image_type(header: bytes) -> Optional[str]:
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.startswith(b"GIF87a") or header.startswith(b"GIF89a"):
        return "image/gif"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "image/webp"
    return None

def media_type_for_filename(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".gif":
        return "image/gif"
    return "application/octet-stream"

def receipt_file_path(expense: models.Expense) -> Path:
    if not expense.receipt_url:
        raise HTTPException(status_code=404, detail="Receipt not found")

    filename = Path(expense.receipt_url).name
    if not filename:
        raise HTTPException(status_code=404, detail="Receipt not found")

    path = (RECEIPT_DIR / filename).resolve()
    if not path.is_relative_to(RECEIPT_DIR.resolve()) or not path.exists():
        raise HTTPException(status_code=404, detail="Receipt not found")

    return path

def validate_ledger_payload(payload: Any, db: Session, current_user_id: str):
    if not current_user_id:
        raise HTTPException(status_code=403, detail="Unauthenticated request")
    if hasattr(payload, 'amount') and (not math.isfinite(payload.amount) or payload.amount <= 0):
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    group = db.query(models.Group).filter(models.Group.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    member_ids = {m.id for m in group.members}
    if current_user_id not in member_ids:
        raise HTTPException(status_code=403, detail="You must be a member of this group to modify the ledger")
        
    if payload.payer_id not in member_ids:
        raise HTTPException(status_code=400, detail="Payer is not in the group")

    if not payload.splits:
        raise HTTPException(status_code=400, detail="At least one split is required")

    split_user_ids = [split.user_id for split in payload.splits]
    if len(split_user_ids) != len(set(split_user_ids)):
        raise HTTPException(status_code=400, detail="Each user can only appear once in splits")

    for split in payload.splits:
        if split.user_id not in member_ids:
            raise HTTPException(status_code=400, detail=f"User {split.user_id} is not in the group")
        if not math.isfinite(split.amount_owed) or split.amount_owed < 0:
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
        generated_for_template = 0
        while template.next_run_on <= today and generated_for_template < MAX_RECURRING_GENERATIONS_PER_TEMPLATE:
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
                generated_for_template += 1

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

OTP_REQUEST_RATE_LIMIT: dict[str, list[datetime]] = {}
OTP_VERIFY_RATE_LIMIT: dict[str, list[datetime]] = {}

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
        print("Email content suppressed because SMTP is not configured.")
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
def request_otp(payload: OTPRequest, request: Request, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    if not email:
        raise HTTPException(400, "Email required")

    now = datetime.utcnow()
    request_key = f"{email}:{request.client.host if request.client else 'unknown'}"
    history = prune_timestamps(
        OTP_REQUEST_RATE_LIMIT.get(request_key, []),
        now,
        OTP_REQUEST_WINDOW_SECONDS,
    )
    if history and (now - history[-1]).total_seconds() < OTP_REQUEST_COOLDOWN_SECONDS:
        raise HTTPException(status_code=429, detail="Please wait before requesting another code")
    if len(history) >= OTP_REQUEST_MAX_PER_WINDOW:
        raise HTTPException(status_code=429, detail="Too many verification code requests")
    history.append(now)
    OTP_REQUEST_RATE_LIMIT[request_key] = history
    
    code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = now + timedelta(minutes=10)
    hashed_code = hash_otp(email, code)
    
    otp_record = db.query(models.UserOTP).filter(models.UserOTP.email == email).first()
    if otp_record:
        otp_record.otp_code = hashed_code
        otp_record.expires_at = expires_at
    else:
        otp_record = models.UserOTP(email=email, otp_code=hashed_code, expires_at=expires_at)
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
    now = datetime.utcnow()
    
    # Check for local development bypass
    is_dev = os.getenv("IS_LOCAL_DEV") == "true"
    if not is_dev:
        history = prune_timestamps(
            OTP_VERIFY_RATE_LIMIT.get(email, []),
            now,
            OTP_VERIFY_WINDOW_SECONDS,
        )
        if len(history) >= OTP_VERIFY_MAX_PER_WINDOW:
            raise HTTPException(429, "Too many verification attempts. Please request a new code.")
        history.append(now)
        OTP_VERIFY_RATE_LIMIT[email] = history
    
    otp_record = db.query(models.UserOTP).filter(models.UserOTP.email == email).first()
    
    if is_dev and code == "123456":
        # Master bypass for dev
        pass
    else:
        hashed_code = hash_otp(email, code)
        otp_matches = bool(
            otp_record and (
                hmac.compare_digest(otp_record.otp_code, hashed_code)
                or hmac.compare_digest(otp_record.otp_code, code)
            )
        )
        if not otp_matches:
            raise HTTPException(401, "Invalid or expired verification code")
            
        if otp_record.expires_at < now:
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
    if otp_record:
        db.delete(otp_record)
    OTP_VERIFY_RATE_LIMIT.pop(email, None)
    db.commit()
    
    return auth_user_response(user)

@app.post("/users/google-login")
def google_login(payload: GoogleLoginPayload, db: Session = Depends(get_db)):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(500, "Server not configured for Google Sign-In")
        
    try:
        idinfo = id_token.verify_oauth2_token(payload.credential, google_requests.Request(), client_id)
        email = idinfo['email'].lower()
        if not idinfo.get("email_verified", False):
            raise HTTPException(401, "Google account email is not verified")
        name = idinfo.get('name', email.split('@')[0])
        
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            user = models.User(name=name, email=email)
            db.add(user)
            db.commit()
            db.refresh(user)
            
        return auth_user_response(user)
    except ValueError:
        raise HTTPException(401, "Invalid Google token")

@app.post("/users/")
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _ = current_user
    email = user.email.lower().strip()
    if not email:
        raise HTTPException(400, "Email required")

    existing_user = db.query(models.User).filter(models.User.email == email).first()
    if existing_user:
        return {"id": existing_user.id, "name": existing_user.name}

    db_user = models.User(name=user.name.strip() or email.split('@')[0].capitalize(), email=email)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return {"id": db_user.id, "name": db_user.name}

@app.put("/users/{user_id}")
def update_user(
    user_id: str,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="You can only update your own profile")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.name = user_update.name.strip()
    if not user.name:
        raise HTTPException(status_code=400, detail="Name is required")
    db.commit()
    db.refresh(user)
    return auth_user_response(user)

@app.post("/groups/")
def create_group(
    group: GroupCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    import re
    import uuid
    # Generate friendly slug
    slug = re.sub(r'[^a-zA-Z0-9\s-]', '', group.name).strip()
    slug = re.sub(r'[\s-]+', '-', slug).lower()
    if not slug:
        slug = "group"
    group_id = f"{slug}-{uuid.uuid4().hex[:6]}"
    
    db_group = models.Group(id=group_id, name=group.name, creator_id=current_user.id)
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    
    db_group.members.append(current_user)
    db.commit()
            
    return {"id": db_group.id, "name": db_group.name}

@app.get("/groups/")
def get_all_groups(
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """Fetches all existing groups that the user is a part of."""
    if not current_user:
        return []
        
    groups = db.query(models.Group).all()
    user_groups = []
    
    for g in groups:
        is_member = any(m.id == current_user.id for m in g.members)
        if is_member:
            user_groups.append({"id": g.id, "name": g.name, "currency": g.currency})
            
    return user_groups

def require_group_access(
    group_id: str,
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    if group.creator_id is None:
        return group
        
    if not current_user:
        raise HTTPException(status_code=403, detail="Access Denied: Please identify yourself to view this group.")
        
    member_ids = [m.id for m in group.members]
    if current_user.id in member_ids:
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
def add_user_to_group(
    group_id: str,
    payload: GroupMemberAdd,
    db: Session = Depends(get_db),
    group: models.Group = Depends(require_group_member),
):
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
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
def remove_user_from_group(
    group_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    group: models.Group = Depends(require_group_member),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user not in group.members:
        raise HTTPException(status_code=400, detail="User is not a member of this group")

    # Calculate net balance to ensure they don't owe or aren't owed money
    expenses = db.query(models.Expense).filter(models.Expense.group_id == group_id, models.Expense.is_deleted == False).all()
    settlements = db.query(models.Settlement).filter(models.Settlement.group_id == group_id, models.Settlement.is_deleted == False).all()
    
    balance = Decimal("0.00")
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
            
    if abs(balance) > Decimal("0.01"):
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
def delete_group(
    group_id: str,
    db: Session = Depends(get_db),
    group: models.Group = Depends(require_group_member),
):
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
def create_expense(
    expense: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    validate_ledger_payload(expense, db, current_user.id)
    db_expense = create_expense_rows(
        db,
        group_id=expense.group_id,
        payer_id=expense.payer_id,
        description=expense.description,
        amount=expense.amount,
        splits=expense.splits,
        creator_id=current_user.id,
    )
    db.commit()
    return {"message": "Expense recorded", "expense_id": db_expense.id}

@app.post("/expenses/{expense_id}/receipt")
def upload_receipt(
    expense_id: str,
    receipt: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.is_deleted == False,
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
        
    group = db.query(models.Group).filter(models.Group.id == expense.group_id).first()
    if not group or current_user.id not in [m.id for m in group.members]:
        raise HTTPException(status_code=403, detail="Unauthorized")

    first_chunk = receipt.file.read(min(8192, MAX_RECEIPT_BYTES + 1))
    detected_type = detect_image_type(first_chunk)
    if not detected_type:
        raise HTTPException(status_code=400, detail="Receipt must be a JPEG, PNG, WebP, or GIF image")

    suffix = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }[detected_type]
    filename = f"{expense_id}-{secrets.token_urlsafe(12)}{suffix}"
    destination = RECEIPT_DIR / filename
    with destination.open("wb") as buffer:
        total_bytes = len(first_chunk)
        if total_bytes > MAX_RECEIPT_BYTES:
            destination.unlink(missing_ok=True)
            raise HTTPException(status_code=413, detail="Receipt image is too large")
        buffer.write(first_chunk)

        while True:
            chunk = receipt.file.read(1024 * 1024)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > MAX_RECEIPT_BYTES:
                destination.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Receipt image is too large")
            buffer.write(chunk)

    original_filename = Path(receipt.filename or filename).name[:255]
    expense.receipt_filename = original_filename
    expense.receipt_url = f"/uploads/receipts/{filename}"
    db.commit()
    return {"message": "Receipt uploaded", "receipt_url": f"/expenses/{expense_id}/receipt"}

@app.get("/expenses/{expense_id}/receipt")
def get_receipt(
    expense_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.is_deleted == False,
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    group = db.query(models.Group).filter(models.Group.id == expense.group_id).first()
    if not group or current_user.id not in [m.id for m in group.members]:
        raise HTTPException(status_code=403, detail="Unauthorized")

    path = receipt_file_path(expense)
    download_name = expense.receipt_filename or path.name
    return FileResponse(
        path=str(path),
        media_type=media_type_for_filename(path.name),
        filename=download_name,
    )

@app.post("/recurring-expenses/")
def create_recurring_expense(
    template: RecurringExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    validate_ledger_payload(template, db, current_user.id)

    start = template.start_date or date.today()
    day_of_month = template.day_of_month or start.day
    if day_of_month < 1 or day_of_month > 31:
        raise HTTPException(status_code=400, detail="day_of_month must be between 1 and 31")
    first_run = first_monthly_run(start, day_of_month)
    if estimated_monthly_runs(first_run, date.today()) > MAX_RECURRING_BACKFILL_MONTHS:
        raise HTTPException(
            status_code=400,
            detail=f"Recurring expenses can backfill at most {MAX_RECURRING_BACKFILL_MONTHS} months",
        )

    db_template = models.RecurringExpenseTemplate(
        group_id=template.group_id,
        payer_id=template.payer_id,
        description=template.description,
        amount=template.amount,
        day_of_month=day_of_month,
        next_run_on=first_run,
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
def delete_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
        
    group = db.query(models.Group).filter(models.Group.id == expense.group_id).first()
    if not group or current_user.id not in [m.id for m in group.members]:
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    # Check if the user is the creator (or payer for grandfathered expenses)
    if expense.creator_id:
        if expense.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only the person who created this expense can delete it")
    else:
        # Fallback for old expenses before creator_id was added
        if expense.payer_id != current_user.id:
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
def create_settlement(
    settlement: SettlementCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Records a payment between two users to clear debt."""
    if settlement.payer_id == settlement.receiver_id:
        raise HTTPException(status_code=400, detail="Payer and receiver cannot be the same")
    if settlement.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    group = db.query(models.Group).filter(models.Group.id == settlement.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    member_ids = {m.id for m in group.members}
    if current_user.id not in member_ids:
        raise HTTPException(status_code=403, detail="Unauthorized to settle in this group")
        
    if current_user.id != settlement.payer_id and current_user.id != settlement.receiver_id:
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
            "receipt_url": f"/expenses/{e.id}/receipt" if e.receipt_url else None,
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
            "receipt_url": f"/expenses/{expense.id}/receipt" if expense.receipt_url else "",
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
