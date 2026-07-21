import "server-only";

export const USER_ROLES = ["admin", "manager", "employee"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isAdminRole(role: UserRole): boolean {
  return role === "admin";
}

export function isManagerOrAbove(role: UserRole): boolean {
  return role === "admin" || role === "manager";
}
