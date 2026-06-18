"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Wallet } from "lucide-react";

export function WelcomeModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    try {
      setIsLoading(true);
      const user = await api.createUser(name.trim(), email.trim().toLowerCase());
      
      localStorage.setItem("pocket_user_id", user.id);
      localStorage.setItem("pocket_user_name", user.name);
      
      onSuccess();
      onClose();
    } catch (error: any) {
      alert(error.message || "Failed to identify user.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="rounded-3xl sm:rounded-3xl border-0 shadow-2xl sm:max-w-md">
        <DialogHeader className="text-center sm:text-center space-y-4 pt-4">
          <div className="mx-auto bg-primary w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-primary/20 rotate-3">
            <Wallet className="text-primary-foreground w-8 h-8 -rotate-3" />
          </div>
          <DialogTitle className="text-2xl font-extrabold tracking-tight">Who are you?</DialogTitle>
          <DialogDescription className="text-base">
            Please identify yourself to create or access groups. We use your email to securely link your balances across groups. No passwords needed!
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Siddharth"
                className="rounded-full h-12 px-4 bg-secondary/50 border-border"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="rounded-full h-12 px-4 bg-secondary/50 border-border"
                required
              />
            </div>
          </div>
          <Button type="submit" size="lg" className="w-full rounded-full h-12 text-base" disabled={isLoading}>
            {isLoading ? "Identifying..." : "Continue to Pocket"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
