// src/app/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, ChevronRight } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const data = await api.getAllGroups();
        setGroups(data);
      } catch (error) {
        console.error("Failed to load existing groups:", error);
      }
    };
    fetchGroups();
  }, []);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

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
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-zinc-900 w-12 h-12 rounded-full flex items-center justify-center mb-2">
            <Wallet className="text-white w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Pocket</CardTitle>
          <CardDescription>
            The mathematically perfect way to split expenses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div className="space-y-2">
              <Input 
                placeholder="e.g., Miami Trip, Apartment 4B" 
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                disabled={isLoading}
                className="h-12 text-lg"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 text-md" 
              disabled={isLoading || !groupName.trim()}
            >
              {isLoading ? "Creating..." : "Create New Group"}
            </Button>
          </form>

          {groups.length > 0 && (
            <div className="mt-8 pt-6 border-t">
              <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 text-center">Your Existing Groups</h3>
              <div className="space-y-2">
                {groups.map((g) => (
                  <Button 
                    key={g.id}
                    variant="outline" 
                    className="w-full justify-between h-auto py-3 px-4"
                    onClick={() => router.push(`/${g.id}`)}
                  >
                    <span className="font-medium text-zinc-900 truncate">{g.name}</span>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}