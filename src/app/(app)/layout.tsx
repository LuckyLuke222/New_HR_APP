import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { AuthSync } from "@/components/app/auth-sync";
import { UserMenu } from "@/components/app/user-menu";
import { getSessionUser } from "@/lib/supabase/helpers";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();
  const role = user?.role ?? "employee";

  const header = (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-end border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      {user ? (
        <UserMenu userId={user.id} displayName={user.displayName} email={user.email} role={user.role} />
      ) : (
        <Link
          href="/login"
          className="rounded-md border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Sign in
        </Link>
      )}
    </header>
  );

  return (
    <AppShell role={role} header={header}>
      <AuthSync serverUserId={user?.id ?? null} />
      {children}
    </AppShell>
  );
}
