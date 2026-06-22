// src/app/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, ChevronRight, Users, Receipt, ArrowRightLeft, PlusCircle, Repeat, Paperclip, Download } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { WelcomeModal } from "@/components/welcome-modal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

type GroupSummary = {
  id: string;
  name: string;
  currency: string;
};

export default function Home() {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"create" | "login">("create");

  const fetchGroups = async () => {
    try {
      const data = await api.getAllGroups();
      setGroups(data);
    } catch (error) {
      console.error("Failed to load existing groups:", error);
    }
  };

  useEffect(() => {
    setUserName(localStorage.getItem("splitvero_user_name"));
    fetchGroups();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("splitvero_user_id");
    localStorage.removeItem("splitvero_user_name");
    setUserName(null);
    setGroups([]);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    // Check identity before creating group
    if (!localStorage.getItem("splitvero_user_id")) {
      setPendingAction("create");
      setIsWelcomeModalOpen(true);
      return;
    }

    createGroup();
  };

  const createGroup = async () => {
    try {
      setIsLoading(true);
      // 1. Create the Group in the Python Backend
      const group = await api.createGroup(groupName);

      // 2. Redirect the user to their new Group Dashboard
      router.push(`/${group.id}`);
    } catch (error) {
      console.error("Failed to create group:", error);
      alert("Failed to create group. Is your Python backend running?");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden transition-colors duration-300">

      {/* HEADER */}
      <header className="w-full flex justify-between items-center p-4 md:px-8 absolute top-0 z-50">
        <div className="flex items-center gap-2 font-bold text-xl text-foreground">
          <div className="bg-primary p-2 rounded-xl">
            <Wallet className="text-primary-foreground w-5 h-5" />
          </div>
          Splitvero
        </div>
        <div className="flex items-center gap-4">
          {userName ? (
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="hidden sm:inline-block truncate max-w-[150px]">{userName}</span>
              <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground text-xs font-bold px-2 py-1 bg-secondary rounded-md transition-colors">Sign Out</button>
            </div>
          ) : (
            <button 
              onClick={() => { setPendingAction("login"); setIsWelcomeModalOpen(true); }} 
              className="text-sm font-bold px-4 py-2 bg-primary text-primary-foreground rounded-[1rem] hover:bg-primary/90 transition-colors shadow-sm"
            >
              Log In
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* HERO SECTION */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 relative pt-32 pb-20">
        {/* Decorative blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none" />

        <div className="text-center mb-10 z-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 max-w-2xl">
          <div className="mx-auto bg-primary w-16 h-16 rounded-[1.5rem] flex items-center justify-center mb-6 shadow-lg shadow-primary/20 rotate-3">
            <Wallet className="text-primary-foreground w-8 h-8 -rotate-3" />
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground mb-6">
            Never wonder who <br className="hidden md:block" /> owes whom again.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto">
            Struggling to keep track of shared expenses? Splitvero makes splitting costs simple, fair, and mathematically perfect.
          </p>
        </div>

        <Card className="w-full max-w-md shadow-2xl dark:shadow-none shadow-indigo-900/5 border-0 bg-card z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150">
          <CardContent className="pt-8">
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div className="space-y-2">
                <Input
                  placeholder="Name your group (e.g. Miami Trip)"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  disabled={isLoading}
                  className="h-14 text-lg rounded-[1.5rem] bg-secondary/50 border-border focus-visible:bg-background focus-visible:ring-primary shadow-inner dark:shadow-black/20"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full h-14 text-lg font-semibold rounded-[1.5rem]"
                disabled={isLoading || !groupName.trim()}
              >
                {isLoading ? "Creating..." : "Start Splitting"}
              </Button>
            </form>

            {groups.length > 0 && (
              <div className="mt-8 pt-6 border-t border-border">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 text-center">Your Groups</h3>
                <div className="space-y-3">
                  {groups.map((g) => (
                    <Button
                      key={g.id}
                      variant="outline"
                      className="w-full justify-between h-auto py-4 px-5 rounded-[1.5rem] border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-foreground"
                      onClick={() => router.push(`/${g.id}`)}
                    >
                      <span className="font-medium truncate text-base">{g.name}</span>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* HOW IT WORKS */}
      <section className="py-24 px-4 bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">How it works</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Get your group organized and settled up in four simple steps.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary"><PlusCircle className="w-6 h-6" /></div>
              <h3 className="text-xl font-semibold text-foreground">Create a Group</h3>
              <p className="text-muted-foreground text-sm">Name your trip or household. No account needed to get started.</p>
            </div>
            {/* Step 2 */}
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Users className="w-6 h-6" /></div>
              <h3 className="text-xl font-semibold text-foreground">Add Friends</h3>
              <p className="text-muted-foreground text-sm">Add anyone involved. They can view the ledger anytime.</p>
            </div>
            {/* Step 3 */}
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Receipt className="w-6 h-6" /></div>
              <h3 className="text-xl font-semibold text-foreground">Add Expenses</h3>
              <p className="text-muted-foreground text-sm">Record who paid and who was involved. We handle the math.</p>
            </div>
            {/* Step 4 */}
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary"><ArrowRightLeft className="w-6 h-6" /></div>
              <h3 className="text-xl font-semibold text-foreground">Settle Up</h3>
              <p className="text-muted-foreground text-sm">Pay the optimal, minimized amount of transactions to get even.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Power Features Section */}
      <section className="py-20 px-4 border-t border-border bg-secondary/20">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Power Features</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Everything you need to manage complex group finances, built right in.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-card/50 backdrop-blur-sm border-border shadow-sm hover:shadow-md transition-shadow rounded-3xl">
              <CardContent className="p-8 space-y-4 text-center flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 mb-2">
                  <Repeat className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground">Recurring Expenses</h3>
                <p className="text-muted-foreground text-sm">Set up rent, internet, and subscriptions to auto-generate every month automatically.</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border shadow-sm hover:shadow-md transition-shadow rounded-3xl">
              <CardContent className="p-8 space-y-4 text-center flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2">
                  <Paperclip className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground">Receipt Uploads</h3>
                <p className="text-muted-foreground text-sm">Attach photos of receipts to expenses so everyone can verify the exact breakdown.</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border shadow-sm hover:shadow-md transition-shadow rounded-3xl">
              <CardContent className="p-8 space-y-4 text-center flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2">
                  <Download className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground">Export to CSV</h3>
                <p className="text-muted-foreground text-sm">Download your entire group's activity ledger into a spreadsheet for personal bookkeeping.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 max-w-3xl mx-auto w-full">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">Frequently Asked Questions</h2>
        </div>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger className="text-left text-lg">Is Splitvero free to use?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base">
              Yes, Splitvero is 100% free. No hidden fees or premium tiers.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger className="text-left text-lg">How are settlements calculated?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base">
              We use a min-cash-flow algorithm to reduce the total number of transactions between members. If A owes B $10, and B owes C $10, we just tell A to pay C $10.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger className="text-left text-lg">Do my friends need to create accounts?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base">
              When you add a friend using their email, they can instantly log in using a secure one-time passcode or Google Sign-In to see the group and add their own expenses!
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-4">
            <AccordionTrigger className="text-left text-lg">Can I split expenses unequally?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base">
              Absolutely. When adding an expense, you can switch from "Equal" to "Exact" splits and manually assign who owes what.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-5">
            <AccordionTrigger className="text-left text-lg">Who is the admin of the group?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base">
              Splitvero operates on a "high trust" model. There are no strict admins—anyone in the group can add members, record expenses, or remove members (as long as all debts are settled!).
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* FOOTER */}
      <footer className="bg-card border-t border-border py-12 px-4 mt-auto">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-xl text-foreground">
            <div className="bg-primary/10 p-2 rounded-xl">
              <Wallet className="text-primary w-5 h-5" />
            </div>
            Splitvero
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <a href="mailto:hello@example.com" className="hover:text-foreground transition-colors">Contact</a>
          </div>
          <div className="text-sm text-muted-foreground">
            © 2026 Splitvero. All rights reserved.
          </div>
        </div>
      </footer>

      <WelcomeModal
        isOpen={isWelcomeModalOpen}
        onClose={() => setIsWelcomeModalOpen(false)}
        onSuccess={() => {
          setIsWelcomeModalOpen(false);
          setUserName(localStorage.getItem("splitvero_user_name"));
          if (pendingAction === "create") {
            createGroup();
          } else {
            fetchGroups();
          }
        }}
      />
    </div>
  );
}
