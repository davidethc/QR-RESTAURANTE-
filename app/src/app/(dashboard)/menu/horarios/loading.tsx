import { PageHeader } from "@/components/shared/page-header";
import { SchedulesLoading } from "@/components/schedules/schedules-loading";

export default function Loading() {
  return <main>
    <PageHeader title="Horarios" />
    <div className="px-4 pb-10 md:px-8"><SchedulesLoading /></div>
  </main>;
}
