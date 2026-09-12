// Central place that decides which "home" a logged-in user is locked into.
// Approved sellers, couriers, admin-courier, and admins/moderators are pinned
// to their own operational panel and never fall back into the buyer (tabs) experience.
export type HomeRoute = "/seller" | "/courier" | "/admin" | "/(tabs)/home";

export function lockedRole(user: any): "seller" | "courier" | "admin" | null {
  if (!user) return null;
  if (user.role === "admin" || user.role === "moderator") return "admin";
  // Admin kuryer va oddiy kuryer bir xil /courier paneliga tushadi
  if (user.role === "courier" || user.role === "admin_courier") return "courier";
  if (user.courier_info?.is_admin_courier) return "courier";
  if (user.seller_info?.approved) return "seller";
  return null;
}

export function homeRouteFor(user: any): HomeRoute {
  const role = lockedRole(user);
  if (role === "admin") return "/admin";
  if (role === "courier") return "/courier";
  if (role === "seller") return "/seller";
  return "/(tabs)/home";
}

export function isAdminCourierUser(user: any): boolean {
  if (!user) return false;
  if (user.role === "admin_courier") return true;
  return !!(user.courier_info && user.courier_info.is_admin_courier);
}