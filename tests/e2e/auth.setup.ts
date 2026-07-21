import fs from "node:fs";
import { test as setup } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const AUTH_DIR = "playwright/.auth";
fs.mkdirSync(AUTH_DIR, { recursive: true });

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\n/)
    .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// The cookie name/domain must match the ORIGIN the browser+app run under
// (`@supabase/ssr` derives the name from the URL host), not the node-side
// sign-in URL above. Under the self-host Caddy front door the suite targets
// `https://kushhr.internal`, so the cookie is `sb-kushhr-auth-token` on
// domain `kushhr.internal`; the local default keeps `127.0.0.1`.
// NOTE: `split(".")[0]` assumes a SINGLE-LABEL host prefix. If the origin ever
// becomes a subdomain (e.g. `app.kushhr.internal` → `"app"`), this derivation
// produces the wrong cookie name and every auth-dependent test silently fails
// with a login redirect — update it then.
const target = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100");
const cookieName = `sb-${target.hostname.split(".")[0]}-auth-token`;
const cookieDomain = target.hostname;
const cookieSecure = target.protocol === "https:";

async function saveAuthState(
  email: string,
  password: string,
  stateFile: string,
) {
  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(error?.message ?? `No session returned for ${email}`);
  }

  const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
  fs.writeFileSync(
    stateFile,
    JSON.stringify(
      {
        cookies: [
          {
            name: cookieName,
            value,
            domain: cookieDomain,
            path: "/",
            expires: data.session.expires_at ?? -1,
            httpOnly: false,
            secure: cookieSecure,
            sameSite: "Lax",
          },
        ],
        origins: [],
      },
      null,
      2,
    ),
  );
}

setup("admin auth", async () => {
  await saveAuthState("admin@kushhr.dev", "TestPass123!", `${AUTH_DIR}/admin.json`);
});

setup("manager auth", async () => {
  await saveAuthState("manager@kushhr.dev", "TestPass123!", `${AUTH_DIR}/manager.json`);
});

setup("employee auth", async () => {
  await saveAuthState("alice@kushhr.dev", "TestPass123!", `${AUTH_DIR}/employee.json`);
});
