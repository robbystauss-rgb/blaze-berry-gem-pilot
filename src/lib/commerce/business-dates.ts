const ZONE = "America/Chicago";
function parts(date: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
}
function isoDay(date: Date) {
  const p = parts(date);
  return `${p.year.padStart(4, "0")}-${p.month}-${p.day}`;
}
export function shiftBusinessDay(day: string, amount: number) {
  const date = new Date(day + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    throw Error("Choose a valid calendar date.");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
/** Business-local midnight; resolves daylight-saving offset independently of viewer timezone. */
export function businessMidnight(day: string) {
  shiftBusinessDay(day, 0);
  const target = Date.parse(day + "T00:00:00Z");
  let candidate = target;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(candidate));
    const represented = Date.parse(
      `${p.year.padStart(4, "0")}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    );
    candidate = target - (represented - candidate);
  }
  return new Date(candidate).toISOString();
}
export function reportBounds(range: string, from = "", through = "", now = new Date()) {
  const today = isoDay(now);
  let start: string;
  if (range === "today") start = businessMidnight(today);
  else if (range === "week") {
    const day = new Date(today + "T12:00:00Z").getUTCDay();
    start = businessMidnight(shiftBusinessDay(today, -(day === 0 ? 6 : day - 1)));
  } else if (range === "month") start = businessMidnight(today.slice(0, 7) + "-01");
  else {
    const days = [1, 7, 30, 90].includes(Number(range)) ? Number(range) : 30;
    start = new Date(now.getTime() - days * 86400000).toISOString();
  }
  return {
    from: from ? businessMidnight(from) : start,
    to: through ? businessMidnight(shiftBusinessDay(through, 1)) : now.toISOString(),
  };
}
