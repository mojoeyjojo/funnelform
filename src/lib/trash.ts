// Soft-delete grace period shared by the Recently deleted view, the purge cron,
// and any copy that quotes the window. Single source of truth for "30 days".
export const TRASH_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days left before a soft-deleted quiz is permanently purged. Lives in a
// lib (not inline in a server component) so the Date.now() call isn't flagged as
// an impure call during render. Clamped at 0.
export function trashDaysLeft(deletedAtIso: string): number {
  const elapsedDays = Math.floor((Date.now() - new Date(deletedAtIso).getTime()) / DAY_MS);
  return Math.max(0, TRASH_GRACE_DAYS - elapsedDays);
}
