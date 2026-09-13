import { beforeEach, expect, it, vi } from "vitest";
import { createQueryChain } from "./helpers/supabase";
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("@/lib/estimates", () => ({ loadEstimates: vi.fn() }));
vi.mock("@/lib/jobs", () => ({
  enqueueJob: vi.fn(),
  claimJob: vi.fn(),
  finishJob: vi.fn(),
}));
import { supabaseAdmin } from "@/lib/supabase";
import { loadEstimates } from "@/lib/estimates";
import { enqueueJob, claimJob } from "@/lib/jobs";
import {
  getGroupEstimateState,
  refreshGroupEstimates,
} from "@/lib/latestEstimates";
let cached: any[];
beforeEach(() => {
  vi.resetAllMocks();
  cached = [];
  vi.mocked(supabaseAdmin.from).mockImplementation(
    (table) =>
      createQueryChain({
        data:
          table === "user_latest_estimates"
            ? cached
            : table === "athlete_state"
              ? [1, 2, 3, 4].map((athlete_id) => ({
                  athlete_id,
                  data_version: 2,
                }))
              : { id: "existing" },
        error: null,
      }) as any,
  );
  vi.mocked(enqueueJob).mockResolvedValue("new");
  vi.mocked(claimJob).mockResolvedValue({
    id: "new",
    kind: "estimates",
    scope: "1",
    input_version: "2",
    payload: {},
    lease_token: "lease",
    attempts: 1,
  });
  vi.mocked(loadEstimates).mockImplementation(async (id) => {
    cached = [
      ...cached,
      { athlete_id: id, result_json: { dataVersion: 2 }, secs_5k: 1500 },
    ];
    return {} as any;
  });
});
it("distinguishes unrefreshed members from computed insufficient evidence", async () => {
  cached = [
    { athlete_id: 1, result_json: { dataVersion: 2 } },
    { athlete_id: 2, result_json: { dataVersion: 1 }, secs_5k: 1500 },
  ];
  const result = await getGroupEstimateState([1, 2, 3]);
  expect(result.estimates).toEqual({ 1: {} });
  expect(result.pendingAthleteIds).toEqual([2, 3]);
});
it("rebuilds missing members in bounded batches", async () => {
  const result = await refreshGroupEstimates([1, 2, 3, 4]);
  expect(loadEstimates).toHaveBeenCalledTimes(2);
  expect(result.estimates).toEqual({ 1: { "5k": 1500 }, 2: { "5k": 1500 } });
  expect(result.pendingAthleteIds).toEqual([3, 4]);
});
it("reuses a queued job and does not duplicate a leased computation", async () => {
  vi.mocked(enqueueJob).mockResolvedValue(undefined);
  vi.mocked(claimJob).mockResolvedValue(undefined);
  const result = await refreshGroupEstimates([1]);
  expect(claimJob).toHaveBeenCalledWith("existing");
  expect(loadEstimates).not.toHaveBeenCalled();
  expect(result.pendingAthleteIds).toEqual([1]);
});
