import {
  format,
  formatDistanceToNowStrict,
  isSameDay,
  isThisWeek,
  isToday,
  isYesterday,
} from 'date-fns';

/** Inbox timestamps: time today, weekday this week, date otherwise. */
export function formatListTime(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  if (isThisWeek(date)) return format(date, 'EEE');
  return format(date, 'd MMM');
}

export const formatMessageTime = (iso: string) => format(new Date(iso), 'h:mm a');

export function formatDayDivider(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, d MMMM yyyy');
}

export const sameDay = (a: string, b: string) => isSameDay(new Date(a), new Date(b));

export const lastSeen = (iso: string) =>
  `last seen ${formatDistanceToNowStrict(new Date(iso), { addSuffix: true })}`;
