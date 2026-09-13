import { syncActivities, syncActivityDetails } from "@/lib/strava";
import { supabaseAdmin } from "@/lib/supabase";
import { runHistoryJob, startHistory } from "@/lib/history";
import { runBriefingJob, groupVersion } from "@/lib/groupCoach";
import { enqueueJob, claimJob, finishJob } from "@/lib/jobs";
import { adaptPlan } from "@/lib/planService";
import { loadEstimates } from "@/lib/estimates";
import { localDate } from "@/lib/calendar";
import { activeModelVersion } from "@/lib/analysis/expected";
import { runStravaWebhookJob } from "@/lib/stravaWebhook";
import { importMayRun } from "@/lib/stravaBudget";
export async function queueAthleteWork(athleteId: number) {
  const { data: state } = await supabaseAdmin
    .from("athlete_state")
    .select("data_version,plan_version")
    .eq("athlete_id", athleteId)
    .maybeSingle();
  const version = `${state?.data_version ?? 0}:${localDate()}`;
  const { data: pending } = await supabaseAdmin
    .from("activities")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("detail_synced", false)
    .gte("start_date", new Date(Date.now() - 60 * 86400000).toISOString())
    .order("start_date", { ascending: false })
    .limit(3);
  for (const run of pending ?? [])
    await enqueueJob(
      "details",
      String(athleteId),
      `${run.id}:${state?.data_version ?? 0}`,
    );
  await enqueueJob("adapt", String(athleteId), version);
  await enqueueJob(
    "estimates",
    String(athleteId),
    `${version}:${activeModelVersion()}`,
  );
  const { data: groups } = await supabaseAdmin
    .from("group_members")
    .select("group_id")
    .eq("athlete_id", athleteId);
  for (const g of groups ?? [])
    await enqueueJob("briefing", g.group_id, await groupVersion(g.group_id));
}
export async function runWorker(
  options: { athleteId?: number; budgetMs?: number } = {},
) {
  const end = Date.now() + (options.budgetMs ?? 20000);
  let scopes: string[] | undefined;
  if (options.athleteId) {
    const { data: groups, error } = await supabaseAdmin
      .from("group_members")
      .select("group_id")
      .eq("athlete_id", options.athleteId);
    if (error) throw error;
    scopes = [
      String(options.athleteId),
      ...(groups ?? []).map((g) => g.group_id),
    ];
  }
  function pendingJobs() {
    let query = supabaseAdmin
      .from("background_jobs")
      .select("id,kind,scope")
      .or(
        `status.eq.queued,and(status.eq.running,lease_until.lt.${new Date().toISOString()})`,
      )
      .lte("available_at", new Date().toISOString())
      .order("created_at")
      .limit(20);
    if (scopes) query = query.in("scope", scopes);
    return query;
  }
  // Apply priority before the database limit; a large archive cannot hide new work.
  let { data, error } = await pendingJobs().neq("kind", "history");
  if (error) throw error;
  if (!data?.length) {
    const history = await pendingJobs().eq("kind", "history").limit(2);
    if (history.error) throw history.error;
    data = history.data;
  }
  const jobs = (data ?? []).sort(
    (a, b) => Number(a.kind === "history") - Number(b.kind === "history"),
  );
  for (const item of jobs) {
    if (Date.now() >= end) break;
    if (item.kind === "strava_event") {
      await runStravaWebhookJob(item.id);
      const { data: connected } = await supabaseAdmin
        .from("strava_tokens")
        .select("athlete_id")
        .eq("athlete_id", Number(item.scope))
        .maybeSingle();
      if (connected) await queueAthleteWork(Number(item.scope));
      continue;
    }
    if (item.kind === "history") {
      await runHistoryJob(item.id);
      continue;
    }
    if (item.kind === "briefing") {
      await runBriefingJob(item.id);
      continue;
    }
    const job = await claimJob(item.id);
    if (!job) continue;
    try {
      if (job.kind === "incremental" || job.kind === "details") {
        const resume = await importMayRun();
        if (resume) {
          await finishJob(job, "Waiting for Strava quota", resume);
          continue;
        }
      }
      if (["adapt", "estimates"].includes(job.kind)) {
        const { data: state, error } = await supabaseAdmin
          .from("athlete_state")
          .select("data_version")
          .eq("athlete_id", Number(job.scope))
          .maybeSingle();
        if (error) throw error;
        if (
          Number(job.input_version.split(":")[0]) !==
          Number(state?.data_version ?? 0)
        ) {
          await finishJob(job);
          continue;
        }
      }
      if (job.kind === "incremental")
        await syncActivities(Number(job.scope), undefined, job.payload);
      if (job.kind === "details")
        await syncActivityDetails(
          Number(job.scope),
          1,
          Number(job.input_version.split(":")[0]),
        );
      if (job.kind === "adapt") await adaptPlan(Number(job.scope));
      if (job.kind === "estimates") await loadEstimates(Number(job.scope));
      await finishJob(job);
    } catch (e) {
      await finishJob(job, e instanceof Error ? e.message : String(e));
    }
  }
}
