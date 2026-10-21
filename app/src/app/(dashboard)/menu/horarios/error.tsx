"use client";

import { PageHeader } from "@/components/shared/page-header";
import { ScheduleLoadError } from "@/components/schedules/schedules-manager";

export default function SchedulesError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <main>
    <PageHeader title="Horarios" />
    <div className="px-4 pb-10 md:px-8"><ScheduleLoadError onRetry={unstable_retry} /></div>
  </main>;
}
