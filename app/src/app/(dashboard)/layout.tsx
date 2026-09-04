import { redirect } from "next/navigation";
import { getMyRestaurant } from "@/lib/queries/staff";
import { DashboardNav } from "./_components/dashboard-nav";
import { DashboardNotifier } from "@/components/shared/dashboard-notifier";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await getMyRestaurant();
  } catch {
    redirect("/login");
  }

  return (
    <div className="min-h-full">
      <DashboardNotifier restaurantId={session.restaurant.id} />
      <DashboardNav session={session} />
      {children}
    </div>
  );
}
