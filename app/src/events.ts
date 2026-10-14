// Events from Supabase (read-only publishable key) plus the time logic for pins and labels.

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
  food_status: 'stated' | 'likely';
  food_reason: string | null;
  requirements: string | null;
  link: string | null;
  open_to: string | null;
};

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const WINDOW_MS = 6 * 60 * 60 * 1000; // show events starting within the next 6 hours
const FIELDS = 'id,title,start_time,end_time,building,room,lat,lng,food,food_status,food_reason,requirements,link,open_to';

export async function fetchEvents(now = new Date()): Promise<FoodEvent[]> {
  if (!URL || !KEY) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY in app/.env');
  const params = new URLSearchParams({
    select: FIELDS,
    end_time: `gt.${now.toISOString()}`,
    start_time: `lt.${new Date(now.getTime() + WINDOW_MS).toISOString()}`,
    order: 'start_time.asc',
  });
  const resp = await fetch(`${URL}/rest/v1/events?${params}`, { headers: { apikey: KEY } });
  if (!resp.ok) throw new Error(`Couldn't load events (${resp.status})`);
  return resp.json();
}

export const isLive = (e: FoodEvent, now: Date) =>
  new Date(e.start_time) <= now && now < new Date(e.end_time);

function clock(d: Date, withMeridiem = true): string {
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, '0');
  return withMeridiem ? `${h}:${m} ${d.getHours() < 12 ? 'AM' : 'PM'}` : `${h}:${m}`;
}

/** "6:00 – 7:30 PM", or "11:30 AM – 1:00 PM" across noon. */
export function whenText(e: FoodEvent): string {
  const s = new Date(e.start_time), end = new Date(e.end_time);
  const sameHalf = (s.getHours() < 12) === (end.getHours() < 12);
  return `${clock(s, !sameHalf)} – ${clock(end)}`;
}

/** "Now · ends 7:30 PM" or "In 1 hr 50 min". */
export function statusText(e: FoodEvent, now: Date): string {
  if (isLive(e, now)) return `Now · ends ${clock(new Date(e.end_time))}`;
  const mins = Math.max(1, Math.round((new Date(e.start_time).getTime() - now.getTime()) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return `In ${h ? `${h} hr ` : ''}${m || !h ? `${m} min` : ''}`.trim();
}

export function whereText(e: FoodEvent): string {
  return [e.building, e.room].filter(Boolean).join(' ') || 'Location not listed';
}

export function linkLabel(e: FoodEvent): string {
  const link = e.link ?? '';
  if (/rsvp|register|sign ?up|ticket/i.test(e.requirements ?? '')) return 'RSVP';
  if (link.includes('instagram.com')) return 'View on Instagram';
  if (link.includes('callink.berkeley.edu')) return 'View on CalLink';
  if (link.includes('events.berkeley.edu')) return 'Event page';
  return 'Open link';
}

/** Spread pins that share a building so each stays tappable. */
export function spreadPins(events: FoodEvent[]): Map<number, { latitude: number; longitude: number }> {
  const seen = new Map<string, number>();
  const out = new Map<number, { latitude: number; longitude: number }>();
  for (const e of events) {
    if (e.lat == null || e.lng == null) continue;
    const key = `${e.lat.toFixed(5)},${e.lng.toFixed(5)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const angle = n * 2.4; // golden-angle spiral
    const r = n ? 0.00013 * Math.sqrt(n) : 0;
    out.set(e.id, { latitude: e.lat + r * Math.sin(angle), longitude: e.lng + r * Math.cos(angle) * 1.27 });
  }
  return out;
}
