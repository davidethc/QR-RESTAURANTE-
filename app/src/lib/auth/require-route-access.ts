import { redirect } from "next/navigation";
import { getRouteRedirect, type PermissionSource } from "@/lib/permissions";

export function requireRouteAccess(member: PermissionSource, pathname: string): void {
  const destination = getRouteRedirect(member, pathname);
  if (destination) redirect(destination);
}
