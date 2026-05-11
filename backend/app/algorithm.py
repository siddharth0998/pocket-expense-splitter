from typing import List, Dict, Tuple
from dataclasses import dataclass

@dataclass
class Transaction:
    payer_id: str
    receiver_id: str
    amount: float

def calculate_min_settlements(
    expenses_data: List[Dict], 
    splits_data: List[Dict]
) -> List[Transaction]:
    """
    Calculates the minimum number of transactions required to settle all debts in a group.
    
    :param expenses_data: List of dicts like [{"id": "e1", "payer_id": "user1", "amount": 100.0}]
    :param splits_data: List of dicts like [{"expense_id": "e1", "user_id": "user2", "amount_owed": 50.0}]
    :return: List of Transaction objects representing who needs to pay whom.
    """
    
    # Step 1: Calculate the Net Balance for every user
    # Positive balance = Owed money (Creditor)
    # Negative balance = Owes money (Debtor)
    balances: Dict[str, float] = {}

    # Add what they paid
    for expense in expenses_data:
        payer = expense["payer_id"]
        balances[payer] = balances.get(payer, 0.0) + expense["amount"]

    # Subtract what they owe
    for split in splits_data:
        debtor = split["user_id"]
        balances[debtor] = balances.get(debtor, 0.0) - split["amount_owed"]

    # Step 2: Separate into Debtors and Creditors
    # Convert to lists of tuples: (user_id, absolute_amount)
    debtors = []
    creditors = []
    
    for user_id, balance in balances.items():
        # Rounding to 2 decimal places to avoid floating point precision issues
        balance = round(balance, 2) 
        if balance < 0:
            debtors.append([user_id, abs(balance)]) # Store as lists so they are mutable
        elif balance > 0:
            creditors.append([user_id, balance])

    # Step 3: The Greedy Matchmaker Algorithm
    settlements: List[Transaction] = []

    while debtors and creditors:
        # Sort so we always process the largest debts/credits first
        # This guarantees the minimum number of transactions
        debtors.sort(key=lambda x: x[1], reverse=True)
        creditors.sort(key=lambda x: x[1], reverse=True)

        debtor_id, debt_amount = debtors[0]
        creditor_id, credit_amount = creditors[0]

        # The settlement amount is the smaller of the two largest balances
        settle_amount = min(debt_amount, credit_amount)
        settle_amount = round(settle_amount, 2)

        # Record the transaction
        settlements.append(Transaction(
            payer_id=debtor_id,
            receiver_id=creditor_id,
            amount=settle_amount
        ))

        # Update the remaining balances
        debtors[0][1] = round(debt_amount - settle_amount, 2)
        creditors[0][1] = round(credit_amount - settle_amount, 2)

        # Remove users who are fully settled up
        if debtors[0][1] == 0:
            debtors.pop(0)
        if creditors[0][1] == 0:
            creditors.pop(0)

    return settlements