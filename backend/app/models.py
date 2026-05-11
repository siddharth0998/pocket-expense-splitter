import uuid
from datetime import datetime
from sqlalchemy import Column, String, Numeric, ForeignKey, DateTime, Table, CheckConstraint, Boolean, Date, Integer, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

# Association Table for the Many-to-Many relationship between Users and Groups
group_members = Table(
    "group_members",
    Base.metadata,
    Column("user_id", String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("group_id", String, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
)

# Core Entities
class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    groups = relationship("Group", secondary=group_members, back_populates="members")
    expenses_paid = relationship("Expense", back_populates="payer")
    settlements_paid = relationship("Settlement", foreign_keys="[Settlement.payer_id]")
    settlements_received = relationship("Settlement", foreign_keys="[Settlement.receiver_id]")

class Group(Base):
    __tablename__ = "groups"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    currency = Column(String, default="USD", nullable=False)  # Currency Loophole Fix
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    members = relationship("User", secondary=group_members, back_populates="groups")
    expenses = relationship("Expense", back_populates="group", cascade="all, delete-orphan", passive_deletes=True)
    settlements = relationship("Settlement", back_populates="group", cascade="all, delete-orphan", passive_deletes=True)
    recurring_expenses = relationship("RecurringExpenseTemplate", back_populates="group", cascade="all, delete-orphan", passive_deletes=True)

# The Ledger (Expenses & Splits)
class Expense(Base):
    __tablename__ = "expenses"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    group_id = Column(String, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True) # Added Index and Cascade
    payer_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False) # Precision Loophole Fix
    receipt_url = Column(String, nullable=True)
    receipt_filename = Column(String, nullable=True)
    recurring_template_id = Column(String, ForeignKey("recurring_expense_templates.id", ondelete="SET NULL"), nullable=True)
    generated_for_month = Column(String, nullable=True)
    is_deleted = Column(Boolean, default=False) # Soft Delete Loophole Fix
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_positive_amount'), # Constraint Loophole Fix
        UniqueConstraint("recurring_template_id", "generated_for_month", name="uq_recurring_expense_month"),
    )

    # Relationships
    group = relationship("Group", back_populates="expenses")
    payer = relationship("User", back_populates="expenses_paid")
    splits = relationship("ExpenseSplit", back_populates="expense", cascade="all, delete-orphan")
    recurring_template = relationship("RecurringExpenseTemplate", back_populates="generated_expenses")

class ExpenseSplit(Base):
    """
    Handles unequal splits. If Alice pays $100 for Alice, Bob, and Charlie (40/30/30),
    there will be 3 rows here. The sum of `amount_owed` must equal Expense.amount.
    """
    __tablename__ = "expense_splits"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    expense_id = Column(String, ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount_owed = Column(Numeric(10, 2), nullable=False) # Precision Loophole Fix

    # Relationships
    expense = relationship("Expense", back_populates="splits")
    user = relationship("User")

class RecurringExpenseTemplate(Base):
    """
    Monthly expense blueprint. Due templates are materialized into regular Expense rows
    when the group ledger is loaded, keeping the audit trail and netting math unchanged.
    """
    __tablename__ = "recurring_expense_templates"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    group_id = Column(String, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    payer_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    day_of_month = Column(Integer, nullable=False)
    next_run_on = Column(Date, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_positive_recurring_amount'),
        CheckConstraint('day_of_month >= 1 AND day_of_month <= 31', name='check_recurring_day_of_month'),
    )

    group = relationship("Group", back_populates="recurring_expenses")
    payer = relationship("User")
    splits = relationship("RecurringExpenseSplit", back_populates="template", cascade="all, delete-orphan")
    generated_expenses = relationship("Expense", back_populates="recurring_template")

class RecurringExpenseSplit(Base):
    __tablename__ = "recurring_expense_splits"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id = Column(String, ForeignKey("recurring_expense_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount_owed = Column(Numeric(10, 2), nullable=False)

    __table_args__ = (
        CheckConstraint('amount_owed >= 0', name='check_non_negative_recurring_split'),
        UniqueConstraint("template_id", "user_id", name="uq_recurring_template_user"),
    )

    template = relationship("RecurringExpenseTemplate", back_populates="splits")
    user = relationship("User")

# Settlements (Paying people back)
class Settlement(Base):
    """
    When a user clicks "Settle Up", it creates a record here to reduce their debt.
    """
    __tablename__ = "settlements"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    group_id = Column(String, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True) # Added Index and Cascade
    payer_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False) # Precision Loophole Fix
    is_deleted = Column(Boolean, default=False) # Soft Delete Loophole Fix
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_positive_settlement_amount'), # Constraint Loophole Fix
        CheckConstraint('payer_id != receiver_id', name='check_different_users'), # Constraint Loophole Fix
    )

    # Relationships
    group = relationship("Group", back_populates="settlements")
    payer = relationship("User", foreign_keys=[payer_id])
    receiver = relationship("User", foreign_keys=[receiver_id])
