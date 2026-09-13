import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createQueryChain } from "./helpers/supabase";
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("@/lib/strava", () => ({
  getValidToken: vi.fn(),
  fetchActivityDetail: vi.fn(),
  fetchActivities: vi.fn(),
}));
vi.mock("@/lib/jobs", () => ({
  enqueueJob: vi.fn(),
  claimJob: vi.fn(),
  finishJob: vi.fn(),
}));
vi.mock("@/lib/worker", () => ({
  queueAthleteWork: vi.fn(),
  runWorker: vi.fn(),
}));
vi.mock("@/lib/stravaBudget", () => ({ importMayRun: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
import { supabaseAdmin } from "@/lib/supabase";
import { getValidToken, fetchActivityDetail } from "@/lib/strava";
import { enqueueJob, claimJob, finishJob } from "@/lib/jobs";
import { importMayRun } from "@/lib/stravaBudget";
import { waitUntil } from "@vercel/functions";
import {
  webhookToken,
  validWebhookToken,
  parseStravaEvent,
  eventVersion,
  processStravaEvent,
  runStravaWebhookJob,
} from "@/lib/stravaWebhook";
import { GET, POST } from "@/app/api/strava/events/[token]/route";
const event = {
  object_type: "activity" as const,
  aspect_type: "create" as const,
  object_id: 123,
  owner_id: 1,
  subscription_id: 9,
  event_time: 1700000000,
};
let chain: ReturnType<typeof createQueryChain>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRAVA_CLIENT_SECRET", "test-client-secret");
  chain = createQueryChain({ data: { athlete_id: 1 }, error: null });
  vi.mocked(supabaseAdmin.from).mockReturnValue(chain as any);
  vi.mocked(getValidToken).mockResolvedValue("test-athlete-token");
  vi.mocked(fetchActivityDetail).mockResolvedValue({
    id: 123,
    athlete: { id: 1 },
    type: "Run",
    start_date: "2026-09-13T00:00:00Z",
    distance: 5000,
    moving_time: 1800,
  });
});
const context = () => ({ params: { token: webhookToken("callback") } });
const request = (body: unknown) =>
  new NextRequest("https://example.com/api/strava/events/token", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("webhook authentication and deliveries", () => {
  it("uses separate callback and verification tokens and rejects tampering", () => {
    expect(webhookToken("callback")).not.toBe(webhookToken("verify"));
    expect(validWebhookToken(webhookToken("callback"), "callback")).toBe(true);
    expect(validWebhookToken("a".repeat(64), "callback")).toBe(false);
    expect(validWebhookToken("", "callback")).toBe(false);
  });
  it("validates owner identity and event fields", () => {
    expect(parseStravaEvent(event)).toEqual(event);
    expect(() => parseStravaEvent({ ...event, owner_id: "1" })).toThrow();
    expect(() =>
      parseStravaEvent({ ...event, object_type: "athlete" }),
    ).toThrow();
    expect(() => parseStravaEvent({ ...event, updates: [] })).toThrow();
  });
  it("deduplicates retries while retaining distinct updates in the same second", () => {
    expect(
      eventVersion({ ...event, updates: { title: "Run", type: "Run" } }),
    ).toBe(eventVersion({ ...event, updates: { type: "Run", title: "Run" } }));
    expect(eventVersion(event)).not.toBe(
      eventVersion({ ...event, aspect_type: "delete" }),
    );
  });
  it("responds to the Strava verification challenge without database work", async () => {
    const url = `https://example.com/?hub.mode=subscribe&hub.challenge=challenge&hub.verify_token=${webhookToken("verify")}`;
    expect(await (await GET(new NextRequest(url), context())).json()).toEqual({
      "hub.challenge": "challenge",
    });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated deliveries before queueing", async () => {
    expect(
      (await POST(request(event), { params: { token: "bad" } })).status,
    ).toBe(401);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
  it("rejects invalid deliveries and asks Strava to retry failed queue writes", async () => {
    expect((await POST(request({}), context())).status).toBe(400);
    vi.mocked(enqueueJob).mockRejectedValue(new Error("DB unavailable"));
    expect((await POST(request(event), context())).status).toBe(503);
  });
  it("ignores deliveries for disconnected athletes", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryChain({ data: null }) as any,
    );
    expect((await POST(request(event), context())).status).toBe(200);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
  it("acknowledges a durable delivery without waiting for processing", async () => {
    vi.mocked(enqueueJob).mockResolvedValue("job-id");
    vi.mocked(claimJob).mockReturnValue(new Promise(() => {}));
    expect((await POST(request(event), context())).status).toBe(200);
    expect(enqueueJob).toHaveBeenCalledWith(
      "strava_event",
      "1",
      eventVersion(event),
      event,
    );
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
  it("does not start another processor for duplicate deliveries", async () => {
    vi.mocked(enqueueJob).mockResolvedValue(undefined);
    expect((await POST(request(event), context())).status).toBe(200);
    expect(waitUntil).not.toHaveBeenCalled();
  });
});

describe("Strava source reconciliation", () => {
  it("updates source fields without overwriting manual classification or exclusions", async () => {
    await processStravaEvent(event);
    expect(chain.upsert).toHaveBeenCalledWith(expect.any(Object), {
      onConflict: "id",
      ignoreDuplicates: true,
    });
    const values = chain.update.mock.calls[0][0];
    expect(values).not.toHaveProperty("run_type");
    expect(values).not.toHaveProperty("run_type_manual");
    expect(values).not.toHaveProperty("excluded_from_analysis");
    expect(chain.eq).toHaveBeenCalledWith("athlete_id", 1);
  });
  it("rejects fetched activities belonging to another athlete", async () => {
    vi.mocked(fetchActivityDetail).mockResolvedValue({
      id: 123,
      athlete: { id: 2 },
    });
    await expect(processStravaEvent(event)).rejects.toThrow("owner mismatch");
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
  it("does not delete a restored activity after a delayed delete event", async () => {
    await processStravaEvent({ ...event, aspect_type: "delete" });
    expect(chain.delete).not.toHaveBeenCalled();
    expect(chain.update).toHaveBeenCalled();
  });
  it("removes only the owned run after Strava confirms it is unavailable", async () => {
    vi.mocked(fetchActivityDetail).mockRejectedValue(
      new Error("Strava 404 fetching activity"),
    );
    await processStravaEvent(event);
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("id", 123);
    expect(chain.eq).toHaveBeenCalledWith("athlete_id", 1);
  });
  it("does not delete data after a Strava outage", async () => {
    vi.mocked(fetchActivityDetail).mockRejectedValue(
      new Error("Strava 500 fetching activity"),
    );
    await expect(processStravaEvent(event)).rejects.toThrow("Strava 500");
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
  it("preserves a newer reconnect when an older revocation arrives", async () => {
    chain = createQueryChain({
      data: {
        updated_at: new Date((event.event_time + 60) * 1000).toISOString(),
      },
    });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain as any);
    await processStravaEvent({
      ...event,
      object_type: "athlete",
      object_id: 1,
      updates: { authorized: "false" },
    });
    expect(chain.delete).not.toHaveBeenCalled();
  });
  it("defers processing to the actual quota reset", async () => {
    const job = {
      id: "job",
      kind: "strava_event",
      scope: "1",
      input_version: "version",
      payload: event,
      lease_token: "lease",
      attempts: 1,
    };
    vi.mocked(claimJob).mockResolvedValue(job);
    vi.mocked(importMayRun).mockResolvedValue("2026-09-14T00:00:00Z");
    await runStravaWebhookJob("job");
    expect(finishJob).toHaveBeenCalledWith(
      job,
      "Waiting for Strava quota",
      "2026-09-14T00:00:00Z",
    );
    expect(fetchActivityDetail).not.toHaveBeenCalled();
  });
});
