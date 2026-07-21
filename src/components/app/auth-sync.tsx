"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Cross-tab auth state listener.
//
// Why this exists: Supabase Auth stores the session in a single cookie per
// browser profile. If a user signs in as a different account in another tab,
// the cookie is overwritten globally, but other tabs still display the
// previous user's chrome (sidebar, avatar, user menu) until something
// triggers a re-render. That created a "stale chrome over fresh body" state
// where one tab showed Alex's sidebar with Alice's dashboard. No data
// crossed any session boundary, but the visual confusion is trust-
// shattering for an HR system.
//
// The fix: subscribe to onAuthStateChange and refresh the route when the
// signed-in user actually changes. `serverUserId` is the identity the
// current DOM was rendered against — anything different means the chrome
// is stale and must be re-fetched.
//
// TOKEN_REFRESHED and USER_UPDATED fire for the same user and are ignored
// to avoid refresh loops.
export function AuthSync({ serverUserId }: { serverUserId: string | null }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        router.refresh();
        return;
      }
      if (event === "SIGNED_IN") {
        const newUserId = session?.user?.id ?? null;
        if (newUserId !== serverUserId) {
          router.refresh();
        }
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [router, serverUserId]);

  return null;
}
