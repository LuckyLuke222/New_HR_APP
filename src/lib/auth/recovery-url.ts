export function recoveryUrlFromTokenHash(redirectTo: string, tokenHash: string) {
  const url = new URL(redirectTo);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "recovery");
  return url.toString();
}
