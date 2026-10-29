// Events from Supabase (read-only publishable key) plus the time logic for pins and labels.
// Ported from app/src/events.ts so the website and the iPhone app agree on what
// counts as live, how times read, and how pins are spread.

export type FoodEvent = {
  id: number;
  title: string;
  start_time: string;
  end_time: string;
  building: string | null;
  room: string | null;
  lat: number | null;
  lng: number | null;
  food: string | null;
  food_status: "stated" | "likely";
  food_reason: string | null;
  requirements: string | null;
  link: string | null;
  open_to: string | null;
  source_urls: string[] | null;
};

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Show events that have not ended and start within the next six hours. */
export const WINDOW_MS = 6 * 60 * 60 * 1000;

/** How far ahead the look-ahead slider can reach. */
export const MAX_WINDOW_MS = 48 * 60 * 60 * 1000;

const FIELDS =
  "id,title,start_time,end_time,building,room,lat,lng,food,food_status,food_reason,requirements,link,open_to,source_urls";

export async function fetchEvents(now = new Date(), windowMs = WINDOW_MS): Promise<FoodEvent[]> {
  if (!URL_BASE || !KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in web/.env.local",
    );
  }
  const params = new URLSearchParams({
    select: FIELDS,
    end_time: `gt.${now.toISOString()}`,
    start_time: `lt.${new Date(now.getTime() + windowMs).toISOString()}`,
    order: "start_time.asc",
  });
  const resp = await fetch(`${URL_BASE}/rest/v1/events?${params}`, {
    headers: { apikey: KEY },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`Couldn't load events (${resp.status})`);
  return resp.json();
}

export const isLive = (e: FoodEvent, now: Date) =>
  new Date(e.start_time) <= now && now < new Date(e.end_time);

export const isPlaced = (e: FoodEvent): e is FoodEvent & { lat: number; lng: number } =>
  e.lat != null && e.lng != null;

function clock(d: Date, withMeridiem = true): string {
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  return withMeridiem ? `${h}:${m} ${d.getHours() < 12 ? "AM" : "PM"}` : `${h}:${m}`;
}

/** "6:00 – 7:30 PM", or "11:30 AM – 1:00 PM" across noon. */
export function whenText(e: FoodEvent): string {
  const s = new Date(e.start_time);
  const end = new Date(e.end_time);
  const sameHalf = s.getHours() < 12 === end.getHours() < 12;
  return `${clock(s, !sameHalf)} – ${clock(end)}`;
}

/** "Now · ends 7:30 PM" or "In 1 hr 50 min". */
export function statusText(e: FoodEvent, now: Date): string {
  if (isLive(e, now)) return `Now · ends ${clock(new Date(e.end_time))}`;
  const mins = Math.max(1, Math.round((new Date(e.start_time).getTime() - now.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `In ${h ? `${h} hr ` : ""}${m || !h ? `${m} min` : ""}`.trim();
}

export function whereText(e: FoodEvent): string {
  return [e.building, e.room].filter(Boolean).join(" ") || "Location not listed";
}

/** A "likely" event has no confirmed food, so it only gets a food line when a specific food is named. */
export function foodText(e: FoodEvent): string | null {
  return e.food_status === "likely" ? e.food : e.food || "Free food";
}

/** The event's link, but only if it's a web link (the card opens it as-is). */
export function webLink(e: FoodEvent): string | null {
  return e.link && /^https?:\/\//i.test(e.link) ? e.link : null;
}

const bare = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

/** Other places the event was posted (besides the main link), for the card's "Also posted" line. */
export function otherSources(e: FoodEvent): { label: string; url: string }[] {
  const seen = new Set([bare(e.link ?? "")]);
  const out: { label: string; url: string }[] = [];
  for (const url of e.source_urls ?? []) {
    if (!/^https?:\/\//i.test(url)) continue;
    const b = bare(url);
    const story = b.match(/^instagram\.com\/stories\/([^/]+)/);
    const label = story
      ? `@${story[1]} story`
      : b.startsWith("instagram.com/")
        ? "Instagram post"
        : b.startsWith("events.berkeley.edu/")
          ? "Berkeley Events"
          : b.split("/")[0];
    if (seen.has(b) || seen.has(label)) continue;
    seen.add(b).add(label);
    out.push({ label, url });
  }
  return out.slice(0, 4);
}

export function linkLabel(e: FoodEvent): string {
  const link = e.link ?? "";
  if (/rsvp|register|sign ?up|ticket/i.test(e.requirements ?? "")) return "RSVP";
  if (link.includes("instagram.com")) return "View on Instagram";
  if (link.includes("callink.berkeley.edu")) return "View on CalLink";
  if (link.includes("events.berkeley.edu")) return "Event page";
  return "Open link";
}

/** Spread pins that share a building so each stays clickable. */
export function spreadPins(events: FoodEvent[]): Map<number, [number, number]> {
  const seen = new Map<string, number>();
  const out = new Map<number, [number, number]>();
  for (const e of events) {
    if (!isPlaced(e)) continue;
    const key = `${e.lat.toFixed(5)},${e.lng.toFixed(5)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const angle = n * 2.4; // golden-angle spiral
    const r = n ? 0.00013 * Math.sqrt(n) : 0;
    out.set(e.id, [e.lng + r * Math.cos(angle) * 1.27, e.lat + r * Math.sin(angle)]);
  }
  return out;
}
