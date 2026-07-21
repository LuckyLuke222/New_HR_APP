import { requireRole } from "@/lib/supabase/helpers";
import { getAppSettings } from "@/server/dal/app-settings";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  await requireRole(["admin"], { attemptedResource: "/settings" });

  const { settings, error } = await getAppSettings();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Company information, leave policy defaults, and working-week
          preferences. Admin only.
        </p>
      </header>

      {error || !settings ? (
        <div className="rounded-md border border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load settings.{error ? ` ${error}` : ""}
        </div>
      ) : (
        <SettingsForm settings={settings} />
      )}
    </div>
  );
}
