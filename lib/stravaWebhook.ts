import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getValidToken, fetchActivityDetail } from "@/lib/strava";
import { summaryRow } from "@/lib/history";
import { claimJob, finishJob } from "@/lib/jobs";
import { importMayRun } from "@/lib/stravaBudget";

export function webhookToken(purpose: "callback" | "verify") {
  const secret = process.env.STRAVA_CLIENT_SECRET;
  if (!secret) throw new Error("Strava is not configured");
  return createHmac("sha256", secret)
    .update(`rundash-strava-webhook-v1:${purpose}`)
    .digest("hex");
}
export function validWebhookToken(
  value: string,
  purpose: "callback" | "verify",
) {
  if (!/^[a-f0-9]{64}$/.test(value)) return false;
  return timingSafeEqual(
    Buffer.from(value),
    Buffer.from(webhookToken(purpose)),
  );
}
export interface StravaEvent {
  object_type: "activity" | "athlete";
  aspect_type: "create" | "update" | "delete";
  object_id: number;
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, string>;
}
export function parseStravaEvent(value: any): StravaEvent {
  if (
    !value ||
    !["activity", "athlete"].includes(value.object_type) ||
    !["create", "update", "delete"].includes(value.aspect_type) ||
    !["object_id", "owner_id", "subscription_id", "event_time"].every(
      (k) => Number.isSafeInteger(value[k]) && value[k] > 0,
    ) ||
    (value.object_type === "athlete" && value.object_id !== value.owner_id) ||
    (value.updates != null &&
      (typeof value.updates !== "object" ||
        Array.isArray(value.updates) ||
        Object.values(value.updates).some((v) => typeof v !== "string")))
  ) {
    throw new Error("Invalid Strava event");
  }
  return value;
}
export function eventVersion(event: StravaEvent) {
  const updates = Object.entries(event.updates ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return createHash("sha256")
    .update(
      JSON.stringify([
        event.subscription_id,
        event.object_type,
        event.object_id,
        event.aspect_type,
        event.event_time,
        updates,
      ]),
    )
    .digest("hex");
}

async function checked(query: PromiseLike<{ error: any }>) {
  const { error } = await query;
  if (error) throw new Error("Could not persist Strava update");
}

export async function processStravaEvent(event: StravaEvent) {
  if (event.object_type === "athlete") {
    if (event.updates?.authorized === "false") {
      // A delayed revocation must not remove credentials from a later reconnect.
      const before = new Date(event.event_time * 1000).toISOString();
      const { data: token, error } = await supabaseAdmin
        .from("strava_tokens")
        .select("updated_at")
        .eq("athlete_id", event.owner_id)
        .maybeSingle();
      if (error) throw error;
      if (token && token.updated_at < before) {
        await checked(
          supabaseAdmin
            .from("strava_tokens")
            .delete()
            .eq("athlete_id", event.owner_id)
            .eq("updated_at", token.updated_at),
        );
        await checked(
          supabaseAdmin
            .from("app_sessions")
            .delete()
            .eq("athlete_id", event.owner_id)
            .lt("created_at", before),
        );
      }
    }
    return;
  }
  const token = await getValidToken(event.owner_id);
  if (!token) return; // Disconnected athletes do not start new imports.
  let detail: any;
  try {
    // Fetch current source data for every event, including delete, so out-of-order
    // notifications cannot resurrect a deleted run or delete a restored one.
    detail = await fetchActivityDetail(token, event.object_id);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("Strava 404 "))
      throw error;
    await checked(
      supabaseAdmin
        .from("activities")
        .delete()
        .eq("id", event.object_id)
        .eq("athlete_id", event.owner_id),
    );
    return;
  }
  if (detail.id !== event.object_id || detail.athlete?.id !== event.owner_id)
    throw new Error("Activity owner mismatch");
  if (detail.type !== "Run" && detail.sport_type !== "Run") {
    await checked(
      supabaseAdmin
        .from("activities")
        .delete()
        .eq("id", event.object_id)
        .eq("athlete_id", event.owner_id),
    );
    return;
  }
  await checked(
    supabaseAdmin
      .from("activities")
      .upsert(summaryRow(detail, event.owner_id), {
        onConflict: "id",
        ignoreDuplicates: true,
      }),
  );
  const { run_type, run_type_manual, is_race, ...observed } = summaryRow(
    detail,
    event.owner_id,
  );
  await checked(
    supabaseAdmin
      .from("activities")
      .update({
        ...observed,
        laps: detail.laps ?? null,
        splits: detail.splits_metric ?? null,
      })
      .eq("id", event.object_id)
      .eq("athlete_id", event.owner_id),
  );
}

export async function runStravaWebhookJob(id: string) {
  const job = await claimJob(id);
  if (!job) return;
  try {
    const event = parseStravaEvent(job.payload);
    if (event.owner_id !== Number(job.scope))
      throw new Error("Event scope mismatch");
    const resume =
      event.object_type === "activity" ? await importMayRun() : null;
    if (resume) {
      await finishJob(job, "Waiting for Strava quota", resume);
      return;
    }
    await processStravaEvent(event);
    await finishJob(job);
  } catch (error) {
    await finishJob(
      job,
      error instanceof Error ? error.message : "Strava webhook failed",
    );
  }
}
