// src/app/[groupId]/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { API_BASE_URL, api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRightLeft, CalendarClock, Download, Paperclip, Receipt, PlusCircle, Users, Trash2 } from "lucide-react";

type Member = {
  id: string;
  name: string;
};

type Group = {
  id: string;
  name: string;
  members: Member[];
};

type Split = {
  user_id: string;
  amount_owed: number;
};

type FeedItem = {
  type: "expense" | "settlement";
  id: string;
  description: string;
  amount: number;
  receipt_url?: string | null;
  generated_for_month?: string | null;
};

type SuggestedSettlement = {
  payer_id: string;
  payer_name: string;
  receiver_id: string;
  receiver_name: string;
  amount: number;
};

type RecurringExpense = {
  id: string;
  description: string;
  amount: number;
  payer_name: string;
  day_of_month: number;
  next_run_on: string;
};

type SelectedMember = {
  id: string;
  name: string;
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function GroupDashboard() {
  const params = useParams();
  const groupId = params.groupId as string;

  // --- State ---
  const [group, setGroup] = useState<Group | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [settlements, setSettlements] = useState<SuggestedSettlement[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal States
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);

  // Form States
  const [newMemberName, setNewMemberName] = useState("");
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [payerId, setPayerId] = useState("");
  const [involvedMembers, setInvolvedMembers] = useState<string[]>([]); // For equal splits
  const [splitType, setSplitType] = useState<"equal" | "exact">("equal");
  const [customSplits, setCustomSplits] = useState<{ [key: string]: string }>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isRecurringExpense, setIsRecurringExpense] = useState(false);
  const [recurringStartDate, setRecurringStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recurringDayOfMonth, setRecurringDayOfMonth] = useState("");

  // Settlement States
  const [settlePayer, setSettlePayer] = useState<SelectedMember | null>(null);
  const [settleReceiver, setSettleReceiver] = useState<SelectedMember | null>(null);
  const [settleAmount, setSettleAmount] = useState("");

  // --- Data Loading ---
  const loadData = useCallback(async () => {
    try {
      const groupData = await api.getGroup(groupId);
      const feedData = await api.getFeed(groupId);
      const [settlementData, recurringData] = await Promise.all([
        api.getSuggestedSettlements(groupId),
        api.getRecurringExpenses(groupId)
      ]);
      const loadedGroup = groupData as Group;
      setGroup(loadedGroup);
      setFeed(Array.isArray(feedData) ? feedData : feedData?.feed || []);
      setSettlements(Array.isArray(settlementData) ? settlementData : settlementData?.settlements || []);
      setRecurringExpenses(Array.isArray(recurringData) ? recurringData : recurringData?.recurring_expenses || []);
      
      // Default to all members being involved in new expenses
      if (loadedGroup?.members) {
        setInvolvedMembers(loadedGroup.members.map((m) => m.id));
      }
    } catch (error) {
      console.error("Failed to load group data", error);
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  // --- Actions ---
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    try {
      const user = await api.createUser(newMemberName, `${newMemberName.replace(/\s+/g, '').toLowerCase()}@example.com`);
      await api.addMemberToGroup(groupId, user.id);
      setNewMemberName("");
      setIsMemberModalOpen(false);
      loadData();
    } catch (error: unknown) {
      alert(errorMessage(error, "Failed to add member"));
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc || !expenseAmount || !payerId) return;

    const amountNum = parseFloat(expenseAmount);
    let splits: Split[] = [];
    
    if (splitType === "equal") {
      if (involvedMembers.length === 0) return;
      const splitAmount = amountNum / involvedMembers.length;
      splits = involvedMembers.map((id) => ({
        user_id: id,
        amount_owed: splitAmount
      }));
    } else {
      let totalCustom = 0;
      splits = Object.entries(customSplits).map(([id, amt]) => {
        const parsed = parseFloat(amt) || 0;
        totalCustom += parsed;
        return { user_id: id, amount_owed: parsed };
      }).filter(s => s.amount_owed > 0);

      if (Math.abs(totalCustom - amountNum) > 0.01) {
        alert(`Custom splits total ($${totalCustom.toFixed(2)}) must exactly equal the expense amount ($${amountNum.toFixed(2)})!`);
        return;
      }
      if (splits.length === 0) {
        alert("Please enter at least one amount greater than zero.");
        return;
      }
    }

    try {
      const payload = {
        group_id: groupId,
        payer_id: payerId,
        description: expenseDesc,
        amount: amountNum,
        splits: splits
      };

      if (isRecurringExpense) {
        await api.createRecurringExpense({
          ...payload,
          start_date: recurringStartDate || undefined,
          day_of_month: recurringDayOfMonth ? parseInt(recurringDayOfMonth, 10) : undefined
        });
      } else {
        const result = await api.createExpense(payload);
        if (receiptFile && result?.expense_id) {
          await api.uploadReceipt(result.expense_id, receiptFile);
        }
      }

      setExpenseDesc("");
      setExpenseAmount("");
      setPayerId("");
      setSplitType("equal");
      setCustomSplits({});
      setReceiptFile(null);
      setIsRecurringExpense(false);
      setRecurringStartDate(new Date().toISOString().slice(0, 10));
      setRecurringDayOfMonth("");
      setIsExpenseModalOpen(false);
      loadData();
    } catch (error: unknown) {
      alert(errorMessage(error, "Failed to add expense."));
    }
  };

  // Open the Settle Up Modal and pre-fill the data
  const openSettleModal = (payerName: string, payerId: string, receiverName: string, receiverId: string, maxAmount: number) => {
    setSettlePayer({ name: payerName, id: payerId });
    setSettleReceiver({ name: receiverName, id: receiverId });
    setSettleAmount(maxAmount.toFixed(2)); // Default to paying the full debt
    setIsSettleModalOpen(true);
  };

  // Submit the custom settlement
  const handleSettleUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(settleAmount);
    if (!amountNum || amountNum <= 0 || !settlePayer || !settleReceiver) return;

    try {
      await api.recordSettlement({
        group_id: groupId,
        payer_id: settlePayer.id,
        receiver_id: settleReceiver.id,
        amount: amountNum
      });
      setIsSettleModalOpen(false);
      loadData();
    } catch (error: unknown) {
      alert(errorMessage(error, "Failed to record settlement."));
    }
  };

  // Toggle member involvement in an expense
  const toggleInvolvedMember = (memberId: string) => {
    setInvolvedMembers(prev => 
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  };

  const handleDeleteGroup = async () => {
    if (!group) return;
    if (!window.confirm(`Are you sure you want to delete "${group.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteGroup(groupId);
      window.location.href = "/"; // Navigate back home
    } catch (error: unknown) {
      alert(errorMessage(error, "Failed to delete group. Ensure all debts are settled first."));
    }
  };

  const handleDeleteExpense = async (expenseId: string, type: string) => {
    if (type !== "expense") {
      alert("Deleting settlements is not supported yet.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete this expense?`)) return;
    try {
      await api.deleteExpense(expenseId);
      loadData();
    } catch (error: unknown) {
      alert(errorMessage(error, "Failed to delete."));
    }
  };

  // --- Render ---
  if (isLoading) return <div className="p-8 text-center text-zinc-500 animate-pulse">Loading ledger...</div>;
  if (!group) return <div className="p-8 text-center text-red-500">Group not found.</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 min-h-screen bg-zinc-50">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-xl border shadow-sm gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">{group.name}</h1>
            <Button variant="ghost" size="icon" onClick={handleDeleteGroup} className="text-red-500 hover:text-red-600 hover:bg-red-50" title="Delete Group">
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
          <p className="text-zinc-500 flex items-center gap-2 mt-1">
            <Users className="w-4 h-4" /> {group.members.length} Members
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => window.location.href = api.getExportUrl(groupId)}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setIsMemberModalOpen(true)}>
            Add Member
          </Button>
          <Button className="bg-zinc-900 text-white flex-1 sm:flex-none" onClick={() => setIsExpenseModalOpen(true)}>
            <PlusCircle className="w-4 h-4 mr-2" /> Add Expense
          </Button>

          {/* ADD MEMBER MODAL */}
          <Dialog open={isMemberModalOpen} onOpenChange={setIsMemberModalOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Add a new member</DialogTitle></DialogHeader>
              <form onSubmit={handleAddMember} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="e.g., Alice" />
                </div>
                <Button type="submit" className="w-full">Add to Group</Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* ADD EXPENSE MODAL WITH CUSTOM SPLITS */}
          <Dialog open={isExpenseModalOpen} onOpenChange={setIsExpenseModalOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Record an expense</DialogTitle></DialogHeader>
              <form onSubmit={handleAddExpense} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} placeholder="Dinner at Joe's" />
                </div>
                <div className="space-y-2">
                  <Label>Amount ($)</Label>
                  <Input type="number" step="0.01" min="0.01" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>Who Paid?</Label>
                  <Select value={payerId} onValueChange={setPayerId}>
                    <SelectTrigger><SelectValue placeholder="Select a member" /></SelectTrigger>
                    <SelectContent>
                      {group.members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Custom Split Toggle */}
                <div className="space-y-3 pt-4 border-t mt-4">
                  <div className="flex justify-between items-center">
                    <Label>How to split?</Label>
                    <div className="flex gap-2">
                      <Button type="button" variant={splitType === "equal" ? "default" : "outline"} size="sm" onClick={() => setSplitType("equal")}>Equal</Button>
                      <Button type="button" variant={splitType === "exact" ? "default" : "outline"} size="sm" onClick={() => setSplitType("exact")}>Exact Amounts</Button>
                    </div>
                  </div>
                  
                  {splitType === "equal" ? (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {group.members.map((m) => (
                        <div key={m.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`member-${m.id}`} 
                            checked={involvedMembers.includes(m.id)}
                            onCheckedChange={() => toggleInvolvedMember(m.id)}
                          />
                          <label htmlFor={`member-${m.id}`} className="text-sm font-medium leading-none">
                            {m.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 mt-2">
                      {group.members.map((m) => (
                        <div key={m.id} className="flex items-center space-x-2">
                          <Label className="w-24 truncate">{m.name}</Label>
                          <Input 
                            type="number" 
                            step="0.01" 
                            min="0"
                            placeholder="0.00"
                            value={customSplits[m.id] || ""}
                            onChange={(e) => setCustomSplits({ ...customSplits, [m.id]: e.target.value })}
                          />
                        </div>
                      ))}
                      <div className="text-xs text-right text-zinc-500 mt-1">
                        Total entered: ${Object.values(customSplits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0).toFixed(2)} / ${parseFloat(expenseAmount || "0").toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="recurring-expense"
                      checked={isRecurringExpense}
                      onCheckedChange={(checked) => {
                        setIsRecurringExpense(checked === true);
                        if (checked === true) setReceiptFile(null);
                      }}
                    />
                    <label htmlFor="recurring-expense" className="text-sm font-medium leading-none">
                      Repeat monthly
                    </label>
                  </div>

                  {isRecurringExpense && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>First run</Label>
                        <Input type="date" value={recurringStartDate} onChange={(e) => setRecurringStartDate(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Day</Label>
                        <Input
                          type="number"
                          min="1"
                          max="31"
                          placeholder="Auto"
                          value={recurringDayOfMonth}
                          onChange={(e) => setRecurringDayOfMonth(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <Label>Receipt photo</Label>
                  <Input
                    key={isRecurringExpense ? "receipt-disabled" : "receipt-enabled"}
                    type="file"
                    accept="image/*"
                    disabled={isRecurringExpense}
                    onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                <Button type="submit" className="w-full mt-4" disabled={group.members.length === 0 || (splitType === "equal" && involvedMembers.length === 0)}>
                  {(splitType === "equal" && involvedMembers.length === 0) ? "Select at least one person!" : isRecurringExpense ? "Save Monthly Expense" : "Save Expense"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* SETTLE UP MODAL */}
          <Dialog open={isSettleModalOpen} onOpenChange={setIsSettleModalOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Settle Up</DialogTitle></DialogHeader>
              <form onSubmit={handleSettleUp} className="space-y-4 pt-4">
                <div className="bg-zinc-100 p-3 rounded-md text-sm text-zinc-600 mb-4">
                  <strong>{settlePayer?.name}</strong> is paying <strong>{settleReceiver?.name}</strong>.
                </div>
                <div className="space-y-2">
                  <Label>Payment Amount ($)</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0.01"
                    value={settleAmount} 
                    onChange={(e) => setSettleAmount(e.target.value)} 
                  />
                </div>
                <Button type="submit" className="w-full">Record Payment</Button>
              </form>
            </DialogContent>
          </Dialog>

        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: ACTIVITY FEED */}
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Receipt className="w-5 h-5 text-zinc-400" /> Recent Activity
          </h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-zinc-500 py-8">
                      No expenses yet. Add a member and an expense to get started!
                    </TableCell>
                  </TableRow>
                ) : (
                  feed.map((item, index) => {
                    const receiptHref = item.receipt_url?.startsWith("http") ? item.receipt_url : `${API_BASE_URL}${item.receipt_url}`;
                    return (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge variant={item.type === "settlement" ? "secondary" : "default"}>
                            {item.type === "settlement" ? "Payment" : item.generated_for_month ? "Monthly" : "Expense"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{item.description}</span>
                            {item.receipt_url && (
                              <a href={receiptHref} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-900" title="Open receipt">
                                <Paperclip className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${item.amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {item.type === "expense" && (
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteExpense(item.id, item.type)} className="text-zinc-400 hover:text-red-500 h-8 w-8">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* RIGHT COLUMN: SETTLEMENTS */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-zinc-400" /> How to Settle Up
          </h2>
          
          {settlements.length === 0 ? (
            <Card className="p-6 text-center text-zinc-500 bg-white border border-dashed">
              All settled up! No debts.
            </Card>
          ) : (
            <div className="space-y-3">
              {settlements.map((s, index) => (
                <Card key={index} className="p-4 border-l-4 border-l-zinc-900 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className="font-semibold text-zinc-900">{s.payer_name}</span>
                      <span className="text-zinc-500 mx-2">owes</span>
                      <span className="font-semibold text-zinc-900">{s.receiver_name}</span>
                    </div>
                    <div className="font-mono font-bold text-lg text-red-600">
                      ${s.amount.toFixed(2)}
                    </div>
                  </div>
                  {/* NEW: The button now opens the Settle Modal! */}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => openSettleModal(s.payer_name, s.payer_id, s.receiver_name, s.receiver_id, s.amount)}
                  >
                    Make a Payment
                  </Button>
                </Card>
              ))}
            </div>
          )}

          <div className="pt-4 space-y-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-zinc-400" /> Monthly Expenses
            </h2>
            {recurringExpenses.length === 0 ? (
              <Card className="p-5 text-center text-zinc-500 bg-white border border-dashed">
                No monthly expenses.
              </Card>
            ) : (
              <div className="space-y-3">
                {recurringExpenses.map((expense) => (
                  <Card key={expense.id} className="p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-zinc-900">{expense.description}</div>
                        <div className="text-sm text-zinc-500">Paid by {expense.payer_name} on day {expense.day_of_month}</div>
                      </div>
                      <div className="font-mono font-bold">${expense.amount.toFixed(2)}</div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">Next: {expense.next_run_on}</div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
