import type { ScheduleShiftInput } from "@/lib/validations/schedules";

export function scheduleTimeLabel(time: string): string {
  return time.slice(0, 5);
}

export function isScheduleShiftDirty(saved: ScheduleShiftInput, draft: ScheduleShiftInput): boolean {
  return saved.weekday !== draft.weekday
    || scheduleTimeLabel(saved.starts_at) !== scheduleTimeLabel(draft.starts_at)
    || scheduleTimeLabel(saved.ends_at) !== scheduleTimeLabel(draft.ends_at);
}
