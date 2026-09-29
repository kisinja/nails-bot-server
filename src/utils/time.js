// Date/time helpers. Everything is done in Nairobi local time (UTC+3,
// no daylight saving) using plain "YYYY-MM-DD" and "HH:MM" strings, so
// there are no timezone surprises when dates get saved and compared.

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// Current date + minutes-since-midnight in Nairobi.
export function nairobiNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

export function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export function isValidTime(time) {
  if (!/^\d{2}:\d{2}$/.test(time || "")) return false;
  const [h, m] = time.split(":").map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}

export function dayOfWeek(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "2026-09-28" -> "Mon 28 Sep 2026"
export function formatDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  return `${WEEKDAYS[dayOfWeek(date)]} ${d} ${MONTHS[m - 1]} ${y}`;
}
