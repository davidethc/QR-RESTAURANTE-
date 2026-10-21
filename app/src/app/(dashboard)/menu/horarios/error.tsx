"use client";

import { PageHeader } from "@/components/shared/page-header";
import { ScheduleLoadError } from "@/components/schedules/schedules-manager";

export default function SchedulesError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main>
    <PageHeader title="Horarios" />
    <div className="px-4 pb-10 md:px-8"><ScheduleLoadError onRetry={retry} /></div>
  </main>;
}
