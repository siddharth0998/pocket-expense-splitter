import uuid
from datetime import datetime
from sqlalchemy import Column, String, Numeric, ForeignKey, DateTime, Table, CheckConstraint, Boolean
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

# The Ledger (Expenses & Splits)
class Expense(Base):
    __tablename__ = "expenses"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    group_id = Column(String, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True) # Added Index and Cascade
    payer_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False) # Precision Loophole Fix
    is_deleted = Column(Boolean, default=False) # Soft Delete Loophole Fix
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_positive_amount'), # Constraint Loophole Fix
    )

    # Relationships
    group = relationship("Group", back_populates="expenses")
    payer = relationship("User", back_populates="expenses_paid")
    splits = relationship("ExpenseSplit", back_populates="expense", cascade="all, delete-orphan")

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