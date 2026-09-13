import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import {
  validWebhookToken,
  parseStravaEvent,
  eventVersion,
  runStravaWebhookJob,
} from "@/lib/stravaWebhook";
import { enqueueJob } from "@/lib/jobs";
import { queueAthleteWork, runWorker } from "@/lib/worker";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: { token: string } };
export async function GET(req: NextRequest, { params }: Context) {
  const query = req.nextUrl.searchParams;
  if (
    !validWebhookToken(params.token, "callback") ||
    query.get("hub.mode") !== "subscribe" ||
    !validWebhookToken(query.get("hub.verify_token") ?? "", "verify") ||
    !query.get("hub.challenge")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ "hub.challenge": query.get("hub.challenge") });
}
export async function POST(req: NextRequest, { params }: Context) {
  if (!validWebhookToken(params.token, "callback"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let event;
  try {
    const body = await req.text();
    if (body.length > 16384)
      return NextResponse.json({ error: "Event too large" }, { status: 413 });
    event = parseStravaEvent(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }
  try {
    const { data: connected, error } = await supabaseAdmin
      .from("strava_tokens")
      .select("athlete_id")
      .eq("athlete_id", event.owner_id)
      .maybeSingle();
    if (error) throw error;
    if (!connected) return NextResponse.json({ ok: true });
    // Commit the delivery before acknowledging it. Strava retries if this fails.
    const id = await enqueueJob(
      "strava_event",
      String(event.owner_id),
      eventVersion(event),
      { ...event },
    );
    if (id)
      waitUntil(
        (async () => {
          const start = Date.now();
          await runStravaWebhookJob(id);
          if (event.object_type === "activity")
            await queueAthleteWork(event.owner_id);
          await runWorker({
            athleteId: event.owner_id,
            budgetMs: Math.max(0, 45000 - (Date.now() - start)),
          });
        })().catch(() =>
          console.error("Strava event remains queued for retry"),
        ),
      );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not save event" },
      { status: 503 },
    );
  }
}
