// src/lib/api.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// --- Types ---
export interface Split {
  user_id: string;
  amount_owed: number;
}

export interface ExpensePayload {
  group_id: string;
  payer_id: string;
  description: string;
  amount: number;
  splits: Split[];
}

export interface SettlementPayload {
  group_id: string;
  payer_id: string;
  receiver_id: string;
  amount: number;
}

// --- Helper for Fetching ---
async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "API request failed");
  }
  return res.json();
}

// --- API Methods ---
export const api = {
  // Users & Groups
  createUser: (name: string, email: string) => 
    fetchAPI("/users/", { method: "POST", body: JSON.stringify({ name, email }) }),
    
  createGroup: (name: string) => 
    fetchAPI("/groups/", { method: "POST", body: JSON.stringify({ name }) }),
    
  getAllGroups: () => 
    fetchAPI("/groups/"),
    
  getGroup: (groupId: string) => 
    fetchAPI(`/groups/${groupId}`),
    
  addMemberToGroup: (groupId: string, userId: string) => 
    fetchAPI(`/groups/${groupId}/members`, { method: "POST", body: JSON.stringify({ user_id: userId }) }),

  // Ledger Actions
  createExpense: (payload: ExpensePayload) => 
    fetchAPI("/expenses/", { method: "POST", body: JSON.stringify(payload) }),
    
  getFeed: (groupId: string) => 
    fetchAPI(`/groups/${groupId}/feed`),

  // Math & Settlements
  getSuggestedSettlements: (groupId: string) => 
    fetchAPI(`/groups/${groupId}/settlements`),
    
  recordSettlement: (payload: SettlementPayload) => 
    fetchAPI("/settlements/", { method: "POST", body: JSON.stringify(payload) }),
    
  deleteGroup: (groupId: string) => 
    fetchAPI(`/groups/${groupId}`, { method: "DELETE" }),
    
  deleteExpense: (expenseId: string) => 
    fetchAPI(`/expenses/${expenseId}`, { method: "DELETE" }),
};