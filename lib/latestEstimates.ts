import { supabaseAdmin } from "@/lib/supabase";
import { loadEstimates } from "@/lib/estimates";
import { activeModelVersion } from "@/lib/analysis/expected";
import { enqueueJob, claimJob, finishJob } from "@/lib/jobs";
import { localDate } from "@/lib/calendar";
export async function updateLatestEstimates(athleteId: number): Promise<void> {
  try {
    await loadEstimates(athleteId);
  } catch (err) {
    console.error("[estimates]", athleteId, err);
  }
}
export async function getGroupLatestEstimates(
  athleteIds: number[],
): Promise<Record<number, Record<string, number>>> {
  try {
    return (await getGroupEstimateState(athleteIds)).estimates;
  } catch {
    console.error("Group estimate cache unavailable");
    return {};
  }
}

export async function getGroupEstimateState(athleteIds: number[]) {
  if (!athleteIds.length)
    return {
      estimates: {},
      pendingAthleteIds: [],
      versions: new Map<number, number>(),
    };
  const { data, error: cacheError } = await supabaseAdmin
    .from("user_latest_estimates")
    .select(
      "athlete_id,secs_5k,secs_10k,secs_hm,secs_fm,model_version,updated_at,result_json",
    )
    .in("athlete_id", athleteIds)
    .eq("model_version", activeModelVersion())
    .gte("updated_at", new Date(Date.now() - 86400000).toISOString());
  const { data: states, error } = await supabaseAdmin
    .from("athlete_state")
    .select("athlete_id,data_version")
    .in("athlete_id", athleteIds);
  if (error || cacheError) throw new Error("Could not read group estimates");
  const versions = new Map(
    (states ?? []).map((s) => [s.athlete_id, Number(s.data_version)]),
  );
  const current = (data ?? []).filter(
    (r) => r.result_json?.dataVersion === (versions.get(r.athlete_id) ?? 0),
  );
  const estimates: Record<number, Record<string, number>> = Object.fromEntries(
    current.map((r: any) => [
      r.athlete_id,
      Object.fromEntries(
        ["5k", "10k", "hm", "fm"]
          .filter((k) => r[`secs_${k}`] != null)
          .map((k) => [k, r[`secs_${k}`]]),
      ),
    ]),
  );
  return {
    estimates,
    versions,
    pendingAthleteIds: athleteIds.filter(
      (id) => !current.some((r) => Number(r.athlete_id) === id),
    ),
  };
}

/** Called lazily by the group tab: at most two analyses, coalesced across viewers. */
export async function refreshGroupEstimates(athleteIds: number[]) {
  const state = await getGroupEstimateState(athleteIds);
  let analyses = 0;
  for (const id of state.pendingAthleteIds.slice(0, 10)) {
    if (analyses >= 2) break;
    const version = `${state.versions.get(id) ?? 0}:${localDate()}:${activeModelVersion()}`;
    let jobId = await enqueueJob("estimates", String(id), version);
    if (!jobId) {
      const { data, error } = await supabaseAdmin
        .from("background_jobs")
        .select("id")
        .eq("kind", "estimates")
        .eq("scope", String(id))
        .eq("input_version", version)
        .maybeSingle();
      if (error) throw error;
      jobId = data?.id;
    }
    if (!jobId) continue;
    const job = await claimJob(jobId);
    if (!job) continue;
    analyses++;
    try {
      await loadEstimates(id);
      const saved = await getGroupEstimateState([id]);
      await finishJob(
        job,
        saved.pendingAthleteIds.length
          ? "Estimate cache was not saved; retry"
          : undefined,
      );
    } catch {
      await finishJob(job, "Could not refresh estimates; retry");
    }
  }
  const refreshed = await getGroupEstimateState(athleteIds);
  return {
    estimates: refreshed.estimates,
    pendingAthleteIds: refreshed.pendingAthleteIds,
  };
}
