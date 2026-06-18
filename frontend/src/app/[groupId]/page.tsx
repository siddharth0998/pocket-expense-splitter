// src/app/[groupId]/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { WelcomeModal } from "@/components/welcome-modal";
import { API_BASE_URL, api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowRightLeft, CalendarClock, Download, Paperclip, Receipt, PlusCircle, Users, Trash2, CheckCircle2 } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);

  // Modal States
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [isViewMembersModalOpen, setIsViewMembersModalOpen] = useState(false);
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
    } catch (error: any) {
      console.error("Failed to load group data", error);
      setError(error.message || "Failed to load group.");
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
      const res = await api.createUser(newMemberName, `${newMemberName.replace(/\s+/g, '').toLowerCase()}@example.com`);
      await api.addMemberToGroup(groupId as string, res.id);
      setNewMemberName("");
      setIsMemberModalOpen(false);
      void loadData();
    } catch (err: any) {
      alert(err.message || "Failed to add member");
    }
  };

  const handleRemoveMember = async (userId: string, userName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${userName} from the group?`)) return;
    try {
      await api.removeMemberFromGroup(groupId as string, userId);
      void loadData();
    } catch (err: any) {
      alert(err.message || "Failed to remove member. They might have unsettled debts!");
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
  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="bg-destructive/10 text-destructive border border-destructive/20 p-8 rounded-[2rem] max-w-md text-center space-y-4 shadow-xl">
        <h2 className="text-2xl font-black">Access Denied</h2>
        <p className="font-medium">{error}</p>
        <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => window.location.href = '/'} variant="outline" className="rounded-full shadow-sm h-12 px-6">Go Home</Button>
          <Button onClick={() => setIsWelcomeModalOpen(true)} variant="default" className="rounded-full shadow-lg h-12 px-6">Identify Yourself</Button>
        </div>
      </div>
      <WelcomeModal 
        isOpen={isWelcomeModalOpen} 
        onClose={() => setIsWelcomeModalOpen(false)} 
        onSuccess={() => {
          setIsWelcomeModalOpen(false);
          setError(null);
          setIsLoading(true);
          loadData();
        }} 
      />
    </div>
  );
  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading ledger...</div>;
  if (!group) return <div className="p-8 text-center text-red-500">Group not found.</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-8 min-h-screen bg-background pb-20 relative">
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* HEADER SECTION */}
      <div className="flex flex-col items-center text-center space-y-4 py-8 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="bg-primary/10 p-4 rounded-full mb-2">
          <Users className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">{group.name}</h1>
          <button onClick={() => setIsViewMembersModalOpen(true)} className="text-muted-foreground mt-2 font-medium hover:text-primary transition-colors hover:underline cursor-pointer">
            {group.members.length} Members
          </button>
        </div>

        <div className="flex flex-wrap justify-center gap-3 pt-6 w-full">
          <Button size="lg" className="rounded-full shadow-lg shadow-primary/20 h-12 px-6" onClick={() => setIsExpenseModalOpen(true)}>
            <PlusCircle className="w-5 h-5 mr-2" /> Add Expense
          </Button>
          <Button variant="outline" size="lg" className="rounded-full bg-card shadow-sm h-12 px-6 border-border hover:border-primary/50" onClick={() => setIsMemberModalOpen(true)}>
            Add Member
          </Button>
          <Button variant="outline" size="icon" className="rounded-full bg-card shadow-sm h-12 w-12 border-border hover:border-primary/50" onClick={() => setIsViewMembersModalOpen(true)} title="View Members">
            <Users className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
          </Button>
          <Button variant="outline" size="icon" className="rounded-full bg-card shadow-sm h-12 w-12 border-border" onClick={() => window.location.href = api.getExportUrl(groupId)} title="Export CSV">
            <Download className="w-5 h-5 text-muted-foreground" />
          </Button>
          <Button variant="outline" size="icon" className="rounded-full bg-card shadow-sm h-12 w-12 border-border hover:border-red-200 hover:bg-red-50" onClick={handleDeleteGroup} title="Delete Group">
            <Trash2 className="w-5 h-5 text-red-500" />
          </Button>
        </div>
      </div>

      {/* MODALS */}
      <Dialog open={isMemberModalOpen} onOpenChange={setIsMemberModalOpen}>
        <DialogContent className="rounded-3xl sm:rounded-3xl border-0 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl">Add a new member</DialogTitle></DialogHeader>
          <form onSubmit={handleAddMember} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="e.g., Alice" className="rounded-full h-12 px-4 bg-secondary/50 border-border" />
            </div>
            <Button type="submit" className="w-full rounded-full h-12">Add to Group</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewMembersModalOpen} onOpenChange={setIsViewMembersModalOpen}>
        <DialogContent className="rounded-3xl sm:rounded-3xl border-0 shadow-2xl max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle className="text-xl">Group Members</DialogTitle></DialogHeader>
          <div className="overflow-y-auto pr-2 -mr-2 pt-4 space-y-3">
            {group.members.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No members yet.</p>
            ) : (
              group.members.map((member) => (
                <div key={member.id} className="flex justify-between items-center bg-secondary/30 p-3 rounded-2xl border border-border hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-sm">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-foreground truncate max-w-[150px]">{member.name}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-full w-9 h-9 p-0 shadow-sm" onClick={() => handleRemoveMember(member.id, member.name)} title="Remove member">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isExpenseModalOpen} onOpenChange={setIsExpenseModalOpen}>
        <DialogContent className="rounded-3xl sm:rounded-3xl border-0 shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-xl">Record an expense</DialogTitle></DialogHeader>
          <form onSubmit={handleAddExpense} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} placeholder="Dinner at Joe's" className="rounded-full h-12 px-4 bg-secondary/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label>Amount ($)</Label>
              <Input type="number" step="0.01" min="0.01" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="0.00" className="rounded-full h-12 px-4 bg-secondary/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label>Who Paid?</Label>
              <Select value={payerId} onValueChange={setPayerId}>
                <SelectTrigger className="rounded-full h-12 px-4 bg-secondary/50 border-border"><SelectValue placeholder="Select a member" /></SelectTrigger>
                <SelectContent position="popper" className="rounded-2xl border-0 shadow-xl w-[var(--radix-select-trigger-width)]">
                  <SelectGroup className="p-2">
                    {group.members.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="rounded-xl py-2.5 px-3">{m.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Split Toggle */}
            <div className="space-y-4 pt-4 border-t border-border mt-4">
              <div className="flex justify-between items-center">
                <Label>How to split?</Label>
                <div className="flex gap-2 bg-secondary p-1 rounded-full">
                  <Button type="button" variant={splitType === "equal" ? "default" : "ghost"} size="sm" className="rounded-full h-8" onClick={() => setSplitType("equal")}>Equal</Button>
                  <Button type="button" variant={splitType === "exact" ? "default" : "ghost"} size="sm" className="rounded-full h-8" onClick={() => setSplitType("exact")}>Exact</Button>
                </div>
              </div>

              {splitType === "equal" ? (
                <div className="grid grid-cols-2 gap-3 mt-2 bg-secondary/50 p-4 rounded-3xl border border-border">
                  {group.members.map((m) => (
                    <div key={m.id} className="flex items-center space-x-3">
                      <Checkbox
                        id={`member-${m.id}`}
                        checked={involvedMembers.includes(m.id)}
                        onCheckedChange={() => toggleInvolvedMember(m.id)}
                        className="rounded-md"
                      />
                      <label htmlFor={`member-${m.id}`} className="text-sm font-medium leading-none cursor-pointer">
                        {m.name}
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 mt-2 bg-secondary/50 p-4 rounded-3xl border border-border">
                  {group.members.map((m) => (
                    <div key={m.id} className="flex items-center space-x-3">
                      <Label className="w-24 truncate">{m.name}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={customSplits[m.id] || ""}
                        onChange={(e) => setCustomSplits({ ...customSplits, [m.id]: e.target.value })}
                        className="rounded-full h-10 bg-card border-border"
                      />
                    </div>
                  ))}
                  <div className="text-xs font-semibold text-right text-muted-foreground mt-2">
                    Total: ${Object.values(customSplits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0).toFixed(2)} / ${parseFloat(expenseAmount || "0").toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="recurring-expense"
                  checked={isRecurringExpense}
                  onCheckedChange={(checked) => {
                    setIsRecurringExpense(checked === true);
                    if (checked === true) setReceiptFile(null);
                  }}
                  className="rounded-md"
                />
                <label htmlFor="recurring-expense" className="text-sm font-medium leading-none cursor-pointer">
                  Repeat monthly
                </label>
              </div>

              {isRecurringExpense && (
                <div className="grid grid-cols-2 gap-4 bg-secondary/50 p-4 rounded-3xl border border-border">
                  <div className="space-y-2">
                    <Label>First run</Label>
                    <Input type="date" value={recurringStartDate} onChange={(e) => setRecurringStartDate(e.target.value)} className="rounded-full h-10 bg-card border-border" />
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
                      className="rounded-full h-10 bg-card border-border"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-4 border-t border-border">
              <Label>Receipt photo</Label>
              <div className={`relative flex items-center h-12 bg-secondary/50 border border-border rounded-full px-2 overflow-hidden transition-opacity ${isRecurringExpense ? "opacity-50 cursor-not-allowed" : "hover:bg-secondary/80"}`}>
                <div className="bg-primary text-primary-foreground shadow-sm shadow-primary/20 font-semibold text-sm px-4 py-1.5 rounded-full mr-3 pointer-events-none">
                  Choose file
                </div>
                <span className="text-sm text-muted-foreground truncate pointer-events-none pr-4">
                  {receiptFile ? receiptFile.name : "No file chosen"}
                </span>
                <input
                  key={isRecurringExpense ? "receipt-disabled" : "receipt-enabled"}
                  type="file"
                  accept="image/*"
                  disabled={isRecurringExpense}
                  onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full mt-6 rounded-full h-12 text-md" disabled={group.members.length === 0 || (splitType === "equal" && involvedMembers.length === 0)}>
              {(splitType === "equal" && involvedMembers.length === 0) ? "Select at least one person!" : isRecurringExpense ? "Save Monthly Expense" : "Save Expense"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettleModalOpen} onOpenChange={setIsSettleModalOpen}>
        <DialogContent className="rounded-3xl sm:rounded-3xl border-0 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl">Settle Up</DialogTitle></DialogHeader>
          <form onSubmit={handleSettleUp} className="space-y-6 pt-4">
            <div className="bg-primary/5 p-4 rounded-3xl text-sm text-primary flex items-center justify-center gap-3">
              <span className="font-bold text-lg">{settlePayer?.name}</span>
              <ArrowRightLeft className="w-5 h-5 opacity-50" />
              <span className="font-bold text-lg">{settleReceiver?.name}</span>
            </div>
            <div className="space-y-2 text-center">
              <Label className="text-muted-foreground">Payment Amount ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                className="rounded-full h-16 text-3xl font-bold text-center bg-secondary/50 border-border focus-visible:ring-primary shadow-inner"
              />
            </div>
            <Button type="submit" size="lg" className="w-full rounded-full h-12 text-lg">Record Payment</Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">

        {/* SETTLEMENTS */}
        <div className="space-y-5">
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-3 px-2">
            <div className="bg-indigo-100 p-2 rounded-xl text-primary"><ArrowRightLeft className="w-5 h-5" /></div>
            How to Settle Up
          </h2>

          {settlements.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground bg-card/60 rounded-[2.5rem] border border-dashed border-border">
              <div className="bg-emerald-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="font-medium text-lg">All settled up!</p>
              <p className="text-sm mt-1">No debts among members.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {settlements.map((s, index) => (
                <div key={index} className="overflow-hidden border border-border shadow-md shadow-zinc-200/50 rounded-[2.5rem] bg-card hover:shadow-lg transition-shadow">
                  <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-[1.5rem] bg-red-50 flex items-center justify-center shrink-0">
                        <ArrowRightLeft className="w-6 h-6 text-red-500" />
                      </div>
                      <div>
                        <div className="text-base text-muted-foreground">
                          <span className="font-bold text-foreground">{s.payer_name}</span> owes <span className="font-bold text-foreground">{s.receiver_name}</span>
                        </div>
                        <div className="font-extrabold text-3xl text-red-600 tracking-tight mt-1">
                          ${s.amount.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="lg"
                      className="rounded-full w-full sm:w-auto font-semibold px-8"
                      onClick={() => openSettleModal(s.payer_name, s.payer_id, s.receiver_name, s.receiver_id, s.amount)}
                    >
                      Settle
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RECENT ACTIVITY */}
        <div className="space-y-5">
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-3 px-2">
            <div className="bg-indigo-100 p-2 rounded-xl text-primary"><Receipt className="w-5 h-5" /></div>
            Recent Activity
          </h2>

          <div className="space-y-4">
            {feed.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground bg-card/60 rounded-[2.5rem] border border-dashed border-border">
                <Receipt className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                <p className="font-medium">No expenses yet.</p>
                <p className="text-sm mt-1">Add a member and an expense to get started!</p>
              </div>
            ) : (
              feed.map((item, index) => {
                const receiptHref = item.receipt_url?.startsWith("http") ? item.receipt_url : `${API_BASE_URL}${item.receipt_url}`;
                const isPayment = item.type === "settlement";
                return (
                  <div key={index} className="flex items-center justify-between p-5 bg-card border border-border rounded-[2rem] shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 ${isPayment ? 'bg-emerald-50 text-emerald-600' : 'bg-primary/10 text-primary'}`}>
                        {isPayment ? <ArrowRightLeft className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="font-bold text-foreground flex items-center gap-2 text-base">
                          {item.description}
                          {item.receipt_url && (
                            <a href={receiptHref} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors" title="Open receipt">
                              <Paperclip className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-muted-foreground mt-1 uppercase tracking-wider">
                          {isPayment ? "Payment" : item.generated_for_month ? "Monthly" : "Expense"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`font-extrabold text-lg tracking-tight ${isPayment ? 'text-emerald-600' : 'text-foreground'}`}>
                        ${item.amount.toFixed(2)}
                      </div>
                      {item.type === "expense" && (
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteExpense(item.id, item.type)} className="text-zinc-300 hover:text-red-500 hover:bg-red-50 w-10 h-10 rounded-full shrink-0">
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* MONTHLY EXPENSES */}
        {recurringExpenses.length > 0 && (
          <div className="space-y-5 pt-4">
            <h2 className="text-xl font-extrabold text-foreground flex items-center gap-3 px-2">
              <div className="bg-orange-100 p-2 rounded-xl text-orange-600"><CalendarClock className="w-5 h-5" /></div>
              Monthly Expenses
            </h2>
            <div className="space-y-4">
              {recurringExpenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-5 bg-card border border-border rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[1.25rem] bg-orange-50 flex items-center justify-center shrink-0">
                      <CalendarClock className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <div className="font-bold text-foreground text-base">{expense.description}</div>
                      <div className="text-xs font-medium text-muted-foreground mt-1">Paid by {expense.payer_name} on day {expense.day_of_month}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-lg text-foreground tracking-tight">${expense.amount.toFixed(2)}</div>
                    <div className="text-xs font-semibold text-muted-foreground mt-1">Next: {expense.next_run_on}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
