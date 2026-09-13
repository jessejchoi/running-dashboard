import { NextResponse } from "next/server";
import { getAthleteId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { refreshGroupEstimates } from "@/lib/latestEstimates";

export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const athleteId = await getAthleteId();
  if (!athleteId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: membership, error } = await supabaseAdmin
    .from("group_members")
    .select("role")
    .eq("group_id", params.id)
    .eq("athlete_id", Number(athleteId))
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Could not check membership" },
      { status: 503 },
    );
  if (!membership)
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  try {
    const { data: members, error } = await supabaseAdmin
      .from("group_members")
      .select("athlete_id")
      .eq("group_id", params.id);
    if (error) throw error;
    return NextResponse.json(
      await refreshGroupEstimates(
        (members ?? []).map((m) => Number(m.athlete_id)),
      ),
    );
  } catch {
    return NextResponse.json(
      { error: "Could not refresh group estimates" },
      { status: 503 },
    );
  }
}
