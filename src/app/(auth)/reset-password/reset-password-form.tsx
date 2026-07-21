"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KushLogo } from "@/components/app/kush-logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const recoverySessionPromises = new Map<string, Promise<boolean>>();

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      setCheckingLink(true);
      setError("");

      const supabase = createClient();
      const params = readAuthParams();
      const urlError = params.get("error_description") ?? params.get("error");

      if (urlError) {
        if (!cancelled) {
          setError(decodeURIComponent(urlError));
          setSessionReady(false);
          setCheckingLink(false);
        }
        return;
      }

      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const verificationType = params.get("type");
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const recoveryKey = buildRecoveryKey({ code, tokenHash, accessToken, refreshToken });

      if (tokenHash && (verificationType !== "recovery" || tokenHash.length < 20)) {
        if (!cancelled) {
          setError("Reset link is incomplete. Copy the full latest reset link and try again.");
          setSessionReady(false);
          setCheckingLink(false);
        }
        return;
      }

      if (!recoveryKey) {
        if (!cancelled) {
          setError("This reset link is invalid or has expired. Request a new one to continue.");
          setSessionReady(false);
          setCheckingLink(false);
        }
        return;
      }

      try {
        await establishRecoverySessionOnce(recoveryKey, {
          code,
          tokenHash,
          accessToken,
          refreshToken,
        });

        const {
          data: { session },
          error: currentSessionError,
        } = await supabase.auth.getSession();
        if (currentSessionError) throw currentSessionError;

        if (!cancelled) {
          setSessionReady(Boolean(session));
          setCheckingLink(false);
          if (session) {
            setMessage("Reset link verified. Enter a new password.");
            window.history.replaceState(null, "", "/reset-password");
          } else {
            setError("This reset link is invalid or has expired. Request a new one to continue.");
          }
        }
      } catch (recoveryError) {
        console.error("auth.reset_password_session failed", recoveryError);
        if (!cancelled) {
          setSessionReady(false);
          setCheckingLink(false);
          setError("Reset link could not be verified. Use the latest reset link and try again.");
        }
      }
    }

    void establishRecoverySession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!sessionReady) {
      setError("This reset link is invalid or has expired. Request a new one to continue.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setPending(false);
      console.error("auth.reset_password_update failed", updateError);
      setError("Password could not be updated. Use the latest reset link and try again.");
      return;
    }

    const { error: signOutError } = await supabase.auth.signOut({
      scope: "local",
    });

    if (signOutError) {
      setPending(false);
      console.error("auth.reset_password_signout failed", signOutError);
      setError("Password was updated, but the recovery session could not be cleared. Sign out manually, then sign in with your new password.");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    router.replace("/login?message=password-updated");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3">
        <KushLogo />
        <h1 className="text-xl font-semibold">Set new password</h1>
        <p className="text-center text-sm text-muted-foreground">
          Choose a new password for your KushHR account.
        </p>
      </div>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>

            {error && (
              <Alert role="alert" variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {error && !sessionReady && !checkingLink && (
              <Link
                href="/forgot-password"
                className="block text-center text-sm font-medium text-primary hover:underline"
              >
                Request a new reset link
              </Link>
            )}
            {message && !error && (
              <Alert role="status">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
            {checkingLink && (
              <p role="status" className="text-sm text-muted-foreground">
                Checking reset link...
              </p>
            )}

            <Button
              type="submit"
              disabled={pending || checkingLink || !sessionReady}
              className="w-full"
            >
              {pending ? "Updating..." : "Update password"}
            </Button>
          </form>
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

function readAuthParams() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#")
    ? new URLSearchParams(window.location.hash.slice(1))
    : new URLSearchParams();

  hash.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });

  return params;
}

function buildRecoveryKey({
  code,
  tokenHash,
  accessToken,
  refreshToken,
}: {
  code: string | null;
  tokenHash: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}) {
  if (code) return `code:${code}`;
  if (tokenHash) return `token_hash:${tokenHash}`;
  if (accessToken && refreshToken) return `session:${accessToken}:${refreshToken}`;
  return null;
}

function establishRecoverySessionOnce(
  recoveryKey: string,
  params: {
    code: string | null;
    tokenHash: string | null;
    accessToken: string | null;
    refreshToken: string | null;
  },
) {
  const existing = recoverySessionPromises.get(recoveryKey);
  if (existing) return existing;

  const promise = establishRecoverySessionFromParams(params).catch((error: unknown) => {
    recoverySessionPromises.delete(recoveryKey);
    throw error;
  });
  recoverySessionPromises.set(recoveryKey, promise);
  return promise;
}

async function establishRecoverySessionFromParams({
  code,
  tokenHash,
  accessToken,
  refreshToken,
}: {
  code: string | null;
  tokenHash: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}) {
  const supabase = createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    if (error) throw error;
  } else if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
  }

  return true;
}
