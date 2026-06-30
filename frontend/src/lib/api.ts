// src/lib/api.ts

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const AUTH_TOKEN_STORAGE_KEY = "splitvero_auth_token";

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

export interface RecurringExpensePayload extends ExpensePayload {
  start_date?: string;
  day_of_month?: number;
}

export interface SettlementPayload {
  group_id: string;
  payer_id: string;
  receiver_id: string;
  amount: number;
}

// --- Helper for Fetching ---
function getAuthToken() {
  return typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "API request failed");
  }
  return res.json();
}

async function uploadAPI(endpoint: string, formData: FormData) {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Upload failed");
  }
  return res.json();
}

// --- API Methods ---
export const api = {
  // Authentication
  requestOtp: (email: string) => 
    fetchAPI("/users/request-otp", { method: "POST", body: JSON.stringify({ email }) }),
    
  verifyOtp: (email: string, code: string) => 
    fetchAPI("/users/verify-otp", { method: "POST", body: JSON.stringify({ email, code }) }),
    
  googleLogin: (credential: string) => 
    fetchAPI("/users/google-login", { method: "POST", body: JSON.stringify({ credential }) }),

  // Users & Groups
  createUser: (name: string, email: string) => 
    fetchAPI("/users/", { method: "POST", body: JSON.stringify({ name, email }) }),
    
  updateUser: (userId: string, name: string) => 
    fetchAPI(`/users/${userId}`, { method: "PUT", body: JSON.stringify({ name }) }),
    
  createGroup: (name: string) => 
    fetchAPI("/groups/", { method: "POST", body: JSON.stringify({ name }) }),
    
  getAllGroups: () => 
    fetchAPI("/groups/"),
    
  getGroup: (groupId: string) => 
    fetchAPI(`/groups/${groupId}`),
    
  addMemberToGroup: (groupId: string, userId: string) => 
    fetchAPI(`/groups/${groupId}/members`, { method: "POST", body: JSON.stringify({ user_id: userId }) }),
    
  removeMemberFromGroup: (groupId: string, userId: string) => 
    fetchAPI(`/groups/${groupId}/members/${userId}`, { method: "DELETE" }),

  // Ledger Actions
  createExpense: (payload: ExpensePayload) => 
    fetchAPI("/expenses/", { method: "POST", body: JSON.stringify(payload) }),

  uploadReceipt: (expenseId: string, file: File) => {
    const formData = new FormData();
    formData.append("receipt", file);
    return uploadAPI(`/expenses/${expenseId}/receipt`, formData);
  },

  openReceipt: async (receiptUrl: string) => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const url = receiptUrl.startsWith("http") ? receiptUrl : `${API_BASE_URL}${receiptUrl}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("Failed to open receipt");

    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    document.body.removeChild(a);
  },

  createRecurringExpense: (payload: RecurringExpensePayload) =>
    fetchAPI("/recurring-expenses/", { method: "POST", body: JSON.stringify(payload) }),

  getRecurringExpenses: (groupId: string) =>
    fetchAPI(`/groups/${groupId}/recurring-expenses`),
    
  getFeed: (groupId: string) => 
    fetchAPI(`/groups/${groupId}/feed`),

  exportGroupCsv: async (groupId: string) => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/export.csv`, { headers });
    if (!res.ok) throw new Error("Failed to export CSV");
    
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `splitvero-group-${groupId}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

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
