const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getTodayKey(now = new Date()) {
  return formatDateKey(now);
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string) {
  const [rawYear, rawMonth, rawDay] = dateKey.split('-').map(Number);
  const year = rawYear ?? 1970;
  const month = rawMonth ?? 1;
  const day = rawDay ?? 1;
  return new Date(year, month - 1, day);
}

export function getPreviousDateKey(dateKey: string) {
  const date = parseDateKey(dateKey);
  return formatDateKey(new Date(date.getTime() - DAY_IN_MS));
}
