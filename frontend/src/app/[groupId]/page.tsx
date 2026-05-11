// src/app/[groupId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRightLeft, Receipt, PlusCircle, Users, Trash2 } from "lucide-react";

export default function GroupDashboard() {
  const params = useParams();
  const groupId = params.groupId as string;

  // --- State ---
  const [group, setGroup] = useState<any>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
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

  // Settlement States
  const [settlePayer, setSettlePayer] = useState<any>(null);
  const [settleReceiver, setSettleReceiver] = useState<any>(null);
  const [settleAmount, setSettleAmount] = useState("");

  // --- Data Loading ---
  const loadData = async () => {
    try {
      const [groupData, feedData, settlementData] = await Promise.all([
        api.getGroup(groupId),
        api.getFeed(groupId),
        api.getSuggestedSettlements(groupId)
      ]);
      setGroup(groupData);
      setFeed(Array.isArray(feedData) ? feedData : feedData?.feed || []);
      setSettlements(Array.isArray(settlementData) ? settlementData : settlementData?.settlements || []);
      
      // Default to all members being involved in new expenses
      if (groupData?.members) {
        setInvolvedMembers(groupData.members.map((m: any) => m.id));
      }
    } catch (error) {
      console.error("Failed to load group data", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [groupId]);

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
    } catch (error: any) {
      alert(error.message || "Failed to add member");
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc || !expenseAmount || !payerId) return;

    const amountNum = parseFloat(expenseAmount);
    let splits: any[] = [];
    
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
      await api.createExpense({
        group_id: groupId,
        payer_id: payerId,
        description: expenseDesc,
        amount: amountNum,
        splits: splits
      });
      setExpenseDesc("");
      setExpenseAmount("");
      setPayerId("");
      setSplitType("equal");
      setCustomSplits({});
      setIsExpenseModalOpen(false);
      loadData();
    } catch (error: any) {
      alert(error.message || "Failed to add expense.");
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
    if (!amountNum || amountNum <= 0) return;

    try {
      // A settlement is just an expense where the payer pays the receiver directly
      await api.createExpense({
        group_id: groupId,
        payer_id: settlePayer.id,
        description: `Payment to ${settleReceiver.name}`,
        amount: amountNum,
        splits: [{
          user_id: settleReceiver.id,
          amount_owed: amountNum
        }]
      });
      setIsSettleModalOpen(false);
      loadData();
    } catch (error: any) {
      alert(error.message || "Failed to record settlement.");
    }
  };

  // Toggle member involvement in an expense
  const toggleInvolvedMember = (memberId: string) => {
    setInvolvedMembers(prev => 
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm(`Are you sure you want to delete "${group.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteGroup(groupId);
      window.location.href = "/"; // Navigate back home
    } catch (error: any) {
      alert(error.message || "Failed to delete group. Ensure all debts are settled first.");
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
    } catch (error: any) {
      alert(error.message || "Failed to delete.");
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
        
        <div className="flex gap-3 w-full sm:w-auto">
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
                      {group.members.map((m: any) => (
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
                      {group.members.map((m: any) => (
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
                      {group.members.map((m: any) => (
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

                <Button type="submit" className="w-full mt-4" disabled={group.members.length === 0 || (splitType === "equal" && involvedMembers.length === 0)}>
                  {(splitType === "equal" && involvedMembers.length === 0) ? "Select at least one person!" : "Save Expense"}
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
                    <TableCell colSpan={3} className="text-center text-zinc-500 py-8">
                      No expenses yet. Add a member and an expense to get started!
                    </TableCell>
                  </TableRow>
                ) : (
                  feed.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Badge variant={item.description?.startsWith("Payment") ? "secondary" : "default"}>
                          {item.description?.startsWith("Payment") ? "Payment" : "Expense"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.description}
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
                  ))
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
        </div>

      </div>
    </div>
  );
}