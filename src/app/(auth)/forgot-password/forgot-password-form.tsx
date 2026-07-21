"use client";

import Link from "next/link";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { useRef, useState, type KeyboardEvent } from "react";
import { KushLogo } from "@/components/app/kush-logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPublicEnv } from "@/lib/env.public";

type AuthActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const initial: AuthActionState = { success: false, message: "" };

export function ForgotPasswordForm() {
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    if (pending) {
      return;
    }

    const normalizedEmail =
      emailInputRef.current?.value.trim().toLowerCase() ?? "";

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setState({
        success: false,
        message: "",
        fieldErrors: { email: ["Enter a valid email address."] },
      });
      return;
    }

    setPending(true);
    setState(initial);

    const supabase = createPasswordResetClient();
    const { error } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo: new URL(
          "/reset-password",
          window.location.origin,
        ).toString(),
      },
    );

    if (error) {
      console.error("auth.request_password_reset failed", error);
      setPending(false);
      setState({
        success: false,
        message: describePasswordResetError(error),
      });
      return;
    }

    setPending(false);
    setState({
      success: true,
      message: "If that email belongs to a KushHR account, a reset link has been sent.",
    });

    void fetch("/api/auth/password-reset-requested", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    }).catch((auditError: unknown) => {
      console.error("auth.password_reset_audit failed", auditError);
    });
  }

  function handleEmailKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void handleSubmit();
  }

  const emailError = state.fieldErrors?.email?.[0];

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3">
        <KushLogo />
        <h1 className="text-xl font-semibold">Reset password</h1>
        <p className="text-center text-sm text-muted-foreground">
          Enter your work email to receive a reset link.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              ref={emailInputRef}
              onKeyDown={handleEmailKeyDown}
              placeholder="you@company.com"
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && (
              <p id="email-error" className="text-sm text-destructive">
                {emailError}
              </p>
            )}
          </div>

          {state.message && (
            <Alert
              role={state.success ? "status" : "alert"}
              variant={state.success ? "default" : "destructive"}
            >
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <Button
            type="button"
            disabled={pending}
            onClick={() => void handleSubmit()}
            className="w-full"
          >
            {pending ? "Sending..." : "Send reset link"}
          </Button>
        </CardContent>
        <CardFooter className="justify-center">
          <Link
            href="/login"
            className="text-sm font-medium text-primary hover:underline"
          >
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

function describePasswordResetError(error: { code?: string; message?: string; status?: number }) {
  const message = error.message?.toLowerCase() ?? "";

  if (
    error.code === "email_address_invalid" ||
    (message.includes("email address") && message.includes("invalid"))
  ) {
    return "Enter an email address that can receive mail. Demo @kushhr.dev seed accounts cannot receive reset emails.";
  }

  if (
    error.status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many")
  ) {
    return "Too many reset emails have been requested. Wait a minute, then try again.";
  }

  return "Password reset email could not be sent. Please try again.";
}

function createPasswordResetClient() {
  const env = getPublicEnv();

  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        flowType: "implicit",
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
