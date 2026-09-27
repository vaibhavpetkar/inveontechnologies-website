import type { Env } from "../shared/env.js";
import { AppError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

/**
 * Meeting provider adapters. "manual" takes any link the organiser pastes;
 * Google Meet and Zoom create a real meeting through their APIs once their
 * credentials are configured, and report themselves unavailable otherwise.
 */
export type ProviderName = "none" | "manual" | "google_meet" | "zoom";

export interface MeetingInput {
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  attendeeEmails: string[];
}

export interface CreatedMeeting {
  joinUrl: string;
  externalId: string | null;
}

export interface MeetingProvider {
  name: ProviderName;
  label: string;
  configured: boolean;
  create(input: MeetingInput): Promise<CreatedMeeting>;
  update?(externalId: string, input: MeetingInput): Promise<void>;
  cancel?(externalId: string): Promise<void>;
}

type FetchLike = typeof fetch;

async function readJson(res: Response, what: string) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error({ status: res.status, body }, `${what} failed`);
    throw new AppError("MEETING_PROVIDER_ERROR", `${what} failed (${res.status}). Check the integration settings.`, 502);
  }
  return body as Record<string, unknown>;
}

/**
 * Google Meet via the Google Calendar API, acting as one organiser account
 * (for example meetings@inveontechnologies.in) with a stored OAuth refresh
 * token. The event also lands in every attendee's Google Calendar.
 */
export function googleMeetProvider(env: Env, fetchImpl: FetchLike = fetch): MeetingProvider {
  const configured = !!(env.PORTAL_GOOGLE_CLIENT_ID && env.PORTAL_GOOGLE_CLIENT_SECRET && env.PORTAL_GOOGLE_REFRESH_TOKEN);
  const calendarId = encodeURIComponent(env.PORTAL_GOOGLE_CALENDAR_ID);
  const base = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

  async function token() {
    const res = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.PORTAL_GOOGLE_CLIENT_ID!,
        client_secret: env.PORTAL_GOOGLE_CLIENT_SECRET!,
        refresh_token: env.PORTAL_GOOGLE_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
    });
    return (await readJson(res, "Google sign-in")).access_token as string;
  }

  const eventBody = (input: MeetingInput) => ({
    summary: input.title,
    description: input.description ?? undefined,
    start: { dateTime: input.startsAt.toISOString(), timeZone: input.timezone },
    end: { dateTime: input.endsAt.toISOString(), timeZone: input.timezone },
    attendees: input.attendeeEmails.map((email) => ({ email })),
  });

  return {
    name: "google_meet",
    label: "Google Meet",
    configured,
    async create(input) {
      const access = await token();
      const res = await fetchImpl(`${base}?conferenceDataVersion=1&sendUpdates=none`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...eventBody(input),
          conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
        }),
      });
      const body = await readJson(res, "Creating the Google Meet");
      const entry = ((body.conferenceData as { entryPoints?: { entryPointType: string; uri: string }[] })?.entryPoints ?? []).find((e) => e.entryPointType === "video");
      const joinUrl = entry?.uri ?? (body.hangoutLink as string | undefined);
      if (!joinUrl) throw new AppError("MEETING_PROVIDER_ERROR", "Google did not return a Meet link", 502);
      return { joinUrl, externalId: body.id as string };
    },
    async update(externalId, input) {
      const access = await token();
      const res = await fetchImpl(`${base}/${encodeURIComponent(externalId)}?sendUpdates=none`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody(input)),
      });
      await readJson(res, "Updating the Google Meet");
    },
    async cancel(externalId) {
      const access = await token();
      const res = await fetchImpl(`${base}/${encodeURIComponent(externalId)}?sendUpdates=none`, { method: "DELETE", headers: { Authorization: `Bearer ${access}` } });
      if (!res.ok && res.status !== 404 && res.status !== 410) await readJson(res, "Cancelling the Google Meet");
    },
  };
}

/** Zoom via a Server-to-Server OAuth app on the company's Zoom account. */
export function zoomProvider(env: Env, fetchImpl: FetchLike = fetch): MeetingProvider {
  const configured = !!(env.PORTAL_ZOOM_ACCOUNT_ID && env.PORTAL_ZOOM_CLIENT_ID && env.PORTAL_ZOOM_CLIENT_SECRET);

  async function token() {
    const basic = Buffer.from(`${env.PORTAL_ZOOM_CLIENT_ID}:${env.PORTAL_ZOOM_CLIENT_SECRET}`).toString("base64");
    const res = await fetchImpl(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(env.PORTAL_ZOOM_ACCOUNT_ID!)}`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}` },
    });
    return (await readJson(res, "Zoom sign-in")).access_token as string;
  }

  const meetingBody = (input: MeetingInput) => ({
    topic: input.title,
    agenda: input.description?.slice(0, 2000) ?? undefined,
    type: 2, // scheduled
    start_time: input.startsAt.toISOString(),
    duration: Math.max(1, Math.round((input.endsAt.getTime() - input.startsAt.getTime()) / 60000)),
    timezone: input.timezone,
    settings: { join_before_host: true, waiting_room: false },
  });

  return {
    name: "zoom",
    label: "Zoom",
    configured,
    async create(input) {
      const access = await token();
      const res = await fetchImpl(`https://api.zoom.us/v2/users/${encodeURIComponent(env.PORTAL_ZOOM_USER)}/meetings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify(meetingBody(input)),
      });
      const body = await readJson(res, "Creating the Zoom meeting");
      return { joinUrl: body.join_url as string, externalId: String(body.id) };
    },
    async update(externalId, input) {
      const access = await token();
      const res = await fetchImpl(`https://api.zoom.us/v2/meetings/${encodeURIComponent(externalId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify(meetingBody(input)),
      });
      if (res.status !== 204) await readJson(res, "Updating the Zoom meeting");
    },
    async cancel(externalId) {
      const access = await token();
      const res = await fetchImpl(`https://api.zoom.us/v2/meetings/${encodeURIComponent(externalId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${access}` } });
      if (res.status !== 204 && res.status !== 404) await readJson(res, "Cancelling the Zoom meeting");
    },
  };
}

const manualProvider: MeetingProvider = {
  name: "manual",
  label: "Paste a link",
  configured: true,
  async create() {
    throw new Error("manual links are passed in directly");
  },
};

export function meetingProviders(env: Env, fetchImpl: FetchLike = fetch) {
  const list = [manualProvider, googleMeetProvider(env, fetchImpl), zoomProvider(env, fetchImpl)];
  return new Map<ProviderName, MeetingProvider>(list.map((p) => [p.name, p]));
}
