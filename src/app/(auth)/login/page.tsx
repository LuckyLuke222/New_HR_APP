import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Suspense fallback={<LoginShell />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

function LoginShell() {
  return (
    <Card className="w-full max-w-sm">
      <CardContent>
        <p className="text-sm text-muted-foreground">Loading sign in...</p>
      </CardContent>
    </Card>
  );
}
