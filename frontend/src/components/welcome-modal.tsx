"use client";

import { useState } from "react";
import Image from "next/image";
import { AUTH_TOKEN_STORAGE_KEY, api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { GoogleOAuthProvider, GoogleLogin, type CredentialResponse } from "@react-oauth/google";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function WelcomeModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Fallback dummy ID if you haven't configured google cloud yet
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "dummy-client-id.apps.googleusercontent.com";

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      setIsLoading(true);
      await api.requestOtp(email.trim().toLowerCase());
      setStep(2);
    } catch (error: unknown) {
      alert(errorMessage(error, "Failed to send verification code."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;

    try {
      setIsLoading(true);
      const user = await api.verifyOtp(email.trim().toLowerCase(), otpCode.trim());
      finishLogin(user);
    } catch (error: unknown) {
      alert(errorMessage(error, "Invalid or expired code."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    try {
      setIsLoading(true);
      const user = await api.googleLogin(credentialResponse.credential);
      finishLogin(user);
    } catch (error: unknown) {
      alert(errorMessage(error, "Google Sign-In failed."));
    } finally {
      setIsLoading(false);
    }
  };

  const finishLogin = (user: { id: string, name: string, token: string, base_currency?: string }) => {
    localStorage.setItem("splitvero_user_id", user.id);
    localStorage.setItem("splitvero_user_name", user.name);
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, user.token);
    if (user.base_currency) {
      localStorage.setItem("splitvero_base_currency", user.base_currency);
    }
    setStep(1);
    setOtpCode("");
    onSuccess();
    onClose();
  };

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          setStep(1);
          setOtpCode("");
          onClose();
        }
      }}>
        <DialogContent className="rounded-3xl sm:rounded-3xl border-0 shadow-2xl sm:max-w-md">
          <DialogHeader className="text-center sm:text-center space-y-4 pt-4 relative">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="absolute left-0 top-4 p-2 hover:bg-secondary rounded-full"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <Image src="/logo.png" alt="Splitvero Logo" width={64} height={64} className="w-16 h-16 mx-auto" />
            <DialogTitle className="text-2xl font-extrabold tracking-tight">
              {step === 1 ? "Who are you?" : "Check your email"}
            </DialogTitle>
            <DialogDescription className="text-base">
              {step === 1
                ? "Sign in to securely link your balances across groups. No passwords needed!"
                : `We sent a 6-digit code to ${email}.`}
            </DialogDescription>
          </DialogHeader>

          {step === 1 ? (
            <div className="space-y-6 pt-4">
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => alert("Google Login Failed")}
                  shape="pill"
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or use email</span>
                </div>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">

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
                <Button type="submit" size="lg" className="w-full rounded-full h-12 text-base mt-2" disabled={isLoading}>
                  {isLoading ? "Sending..." : "Send Code"}
                </Button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6 pt-4">
              <div className="space-y-2">
                <Label htmlFor="otpCode">6-Digit Code</Label>
                <Input
                  id="otpCode"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="rounded-full h-12 px-4 bg-secondary/50 border-border text-center tracking-[0.5em] font-mono text-lg"
                  maxLength={6}
                  required
                />
              </div>
              <Button type="submit" size="lg" className="w-full rounded-full h-12 text-base" disabled={isLoading || otpCode.length !== 6}>
                {isLoading ? "Verifying..." : "Verify & Continue"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </GoogleOAuthProvider>
  );
}
