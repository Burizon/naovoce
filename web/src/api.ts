// Client of the Na ovoce REST API (/api/v1). Authentication uses the API token
// returned by /api/v1/token/, kept in localStorage.

export type KindClass = "Trees" | "Bushes" | "Herbs" | "Nuts" | string;

export interface Kind {
  key: string;
  name: string;
  col: string;
  cls: KindClass;
}

export interface FruitMarker {
  id: number;
  lat: string;
  lng: string;
  kind: string;
  time: string;
  url: string;
}

export interface FruitDetail extends FruitMarker {
  description: string;
  user: { id: number; username: string };
  images_count: number;
}

export type RipenessState = "unripe" | "ripe" | "over";
export type SeasonStatus = "ripe" | "over" | "unripe" | "in_season" | "soon" | "off" | "unknown";
export type WindowSource = "typical" | "observed" | "reported";

export interface Window {
  part: string;
  start: string;
  end: string;
  source: WindowSource;
}

export interface TypicalSeason {
  part: string;
  start: number;
  duration: number;
  months: number[];
}

export interface ObservedYear {
  year: number;
  first_ripe: string;
  last_ripe: string;
  reports: number;
  reporters: number;
}

export interface RipenessReport {
  id: number;
  state: RipenessState;
  observed_on: string;
  note: string;
  author: string;
  created: string;
}

export interface FruitSeason {
  fruit: number;
  kind: string;
  status: SeasonStatus;
  predicted: Window | null;
  typical: TypicalSeason[];
  observed: ObservedYear[];
  recent_votes: Record<RipenessState, number>;
  reports: RipenessReport[];
}

export interface CalendarRow {
  kind: string;
  name: string;
  col: string;
  cls: KindClass;
  count: number;
  typical: TypicalSeason[];
  ripe_reports_by_month: number[];
}

export interface AreaRow {
  kind: string;
  name: string;
  col: string;
  count: number;
  windows: Window[];
}

export type Bbox = [west: number, south: number, east: number, north: number];

export interface HarvestAlert {
  id: number;
  name: string;
  bbox: Bbox;
  kinds: string[];
  lead_days: number;
  is_active: boolean;
  via_email: boolean;
  created: string;
  overview: AreaRow[];
}

export type HarvestAlertInput = Pick<HarvestAlert, "name" | "bbox" | "kinds" | "lead_days" | "via_email">;

export interface Session {
  token: string;
  id: number;
  username: string;
}

const API = "/api/v1";
const SESSION_KEY = "naovoce.session";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(describeError(detail) ?? `HTTP ${status}`);
  }
}

function describeError(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(describeError).filter(Boolean).join(" ");
  if (detail && typeof detail === "object") {
    return Object.values(detail as Record<string, unknown>)
      .map(describeError)
      .filter(Boolean)
      .join(" ");
  }
  return null;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage may be unavailable (private mode); the session then lasts for the page only.
  }
}

function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function request<T>(path: string, init: RequestInit = {}, session: Session | null = null): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (session) headers.set("Authorization", `Token ${session.token}`);
  // A Django admin session on the same origin makes DRF demand the CSRF token.
  const csrf = csrfToken();
  if (csrf && init.method && init.method !== "GET") headers.set("X-CSRFToken", csrf);

  const response = await fetch(`${API}${path}`, { ...init, headers, credentials: "same-origin" });
  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

function query(params: Record<string, string | number | undefined | null | false>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== false && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const bboxParam = (bbox: Bbox): string => bbox.map((value) => value.toFixed(5)).join(",");

export const api = {
  kinds: () => request<Kind[]>("/fruit/kinds/"),

  fruit: (filter: { month?: number | null; ripe?: boolean; kind?: string | null }) =>
    request<FruitMarker[]>(`/fruit/${query({ month: filter.month, ripe: filter.ripe && 1, kind: filter.kind })}`),

  fruitDetail: (id: number) => request<FruitDetail>(`/fruit/${id}/`),

  season: (id: number) => request<FruitSeason>(`/fruit/${id}/season/`),

  report: (id: number, state: RipenessState, note: string, session: Session) =>
    request<FruitSeason>(`/fruit/${id}/season/`, { method: "POST", body: JSON.stringify({ state, note }) }, session),

  calendar: (bbox: Bbox | null) =>
    request<CalendarRow[]>(`/harvest/calendar/${query({ bbox: bbox && bboxParam(bbox) })}`),

  area: (bbox: Bbox) => request<AreaRow[]>(`/harvest/area/${query({ bbox: bboxParam(bbox) })}`),

  alerts: (session: Session) => request<HarvestAlert[]>("/harvest/alerts/", {}, session),

  createAlert: (input: HarvestAlertInput, session: Session) =>
    request<HarvestAlert>("/harvest/alerts/", { method: "POST", body: JSON.stringify(input) }, session),

  updateAlert: (id: number, changes: Partial<HarvestAlertInput & { is_active: boolean }>, session: Session) =>
    request<HarvestAlert>(`/harvest/alerts/${id}/`, { method: "PATCH", body: JSON.stringify(changes) }, session),

  deleteAlert: (id: number, session: Session) =>
    request<void>(`/harvest/alerts/${id}/`, { method: "DELETE" }, session),

  login: async (username: string, password: string): Promise<Session> => {
    const result = await request<{ token: string; id: number }>("/token/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    return { ...result, username };
  },
};
