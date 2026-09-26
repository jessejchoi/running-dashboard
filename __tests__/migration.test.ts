import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
let db: PGlite
const group = '10000000-0000-0000-0000-000000000001'
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table groups(id uuid primary key default gen_random_uuid(),name text);
 create table group_members(group_id uuid,athlete_id bigint,role text);
 create table strava_tokens(athlete_id bigint primary key,athlete_name text);
 create table user_goals(id uuid primary key default gen_random_uuid(),athlete_id bigint,distance_key text,label text,target_secs int,current_secs int,race_date date,unique(athlete_id,distance_key));
 create table activities(id bigint primary key,athlete_id bigint,type text,start_date timestamptz,distance numeric,moving_time int,total_elevation_gain numeric);
 create table activity_best_efforts(athlete_id bigint,activity_start_date timestamptz);
 create table user_latest_estimates(athlete_id bigint primary key,secs_5k int,secs_10k int,secs_hm int,secs_fm int,updated_at timestamptz);
 create table estimate_snapshots(athlete_id bigint,distance_key text,estimated_secs int,snapshotted_at date,primary key(athlete_id,distance_key,snapshotted_at));
 create table user_plans(id uuid primary key default gen_random_uuid(),athlete_id bigint,plan_date date,session_index int default 0,session_type text,description text,target_distance_meters numeric,created_at timestamptz default now(),updated_at timestamptz default now(),constraint user_plans_athlete_id_plan_date_session_index_key unique(athlete_id,plan_date,session_index));
 create table group_coach_briefings(group_id uuid unique,content_json jsonb,generated_at timestamptz);
 create table group_challenges(id uuid primary key default gen_random_uuid(),group_id uuid,name text);
 `)
  const sql = readFileSync('supabase/migration_021.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  await db.exec(
    "insert into background_jobs(kind,scope,input_version) values('adapt','70','1:2026-09-26')",
  )
  const retirePlans = readFileSync('supabase/migration_024.sql', 'utf8')
  await db.exec(retirePlans)
  await db.exec(retirePlans)
  await db.query('insert into groups(id,name) values($1,$2)', [
    group,
    'Test group',
  ])
  await db.exec(
    `insert into group_members values('${group}',1,'admin'),('${group}',2,'member');insert into strava_tokens values(1,'Runner One'),(2,'Runner Two');`,
  )
}, 30000)
afterAll(async () => {
  await db?.close()
})

it('repairs an already migrated production primary key without losing history', async () => {
  const production = new PGlite()
  try {
    await production.exec(`create table estimate_snapshots(
      athlete_id bigint, distance_key text, snapshotted_at date, model_version text,
      estimated_secs integer, primary key(athlete_id,distance_key,snapshotted_at));
      create unique index snapshots_model_day on estimate_snapshots(athlete_id,distance_key,snapshotted_at,model_version);
      insert into estimate_snapshots values(1,'5k','2026-09-13','legacy-unversioned',1500);`)
    const repair = readFileSync('supabase/migration_022.sql', 'utf8')
    await production.exec(repair)
    await production.exec(repair)
    await production.exec("insert into estimate_snapshots values(1,'5k','2026-09-13','cp-today-v1',1600)")
    const rows = await production.query('select model_version,estimated_secs from estimate_snapshots order by estimated_secs')
    expect(rows.rows).toEqual([
      { model_version: 'legacy-unversioned', estimated_secs: 1500 },
      { model_version: 'cp-today-v1', estimated_secs: 1600 },
    ])
    await expect(production.exec("insert into estimate_snapshots values(1,'5k','2026-09-13','cp-today-v1',1700)")).rejects.toThrow('duplicate key')
  } finally {
    await production.close()
  }
}, 30000)
describe('migration and database invariants', () => {
  it('preserves multiple races of the same distance', async () => {
    await db.exec(
      `insert into user_goals(athlete_id,distance_key,race_date) values(1,'10k','2026-10-01'),(1,'10k','2026-11-01');`,
    )
    const r = await db.query(
      'select count(*) from user_goals where athlete_id=1',
    )
    expect(Number((r.rows[0] as any).count)).toBe(2)
  })
  it('leases a job only once until expiry', async () => {
    const r = await db.query(
      `insert into background_jobs(kind,scope,input_version) values('test','1','lease') returning id`,
    )
    const id = (r.rows[0] as any).id
    const first = await db.query('select * from claim_job($1)', [id])
    const second = await db.query('select * from claim_job($1)', [id])
    expect(first.rows).toHaveLength(1)
    expect(second.rows).toHaveLength(0)
  })
  it('aggregates 10,000 runs without client row-limit truncation', async () => {
    await db.exec(
      `insert into activities(id,athlete_id,type,start_date,distance,moving_time) select g,3,'Run','2026-01-01'::timestamptz+g*interval '1 minute',1000,400 from generate_series(1,10000)g`,
    )
    const r = await db.query('select coach_range_totals($1,$2) as totals', [
      [3],
      JSON.stringify([
        { key: 'all_time', range_start: null, range_end: '2027-01-01' },
      ]),
    ])
    expect((r.rows[0] as any).totals[0].runs).toBe(10000)
    expect((r.rows[0] as any).totals[0].meters).toBe(10000000)
  })
  it('retires plan storage and adaptation jobs', async () => {
    const left = await db.query<any>(
      "select to_regclass('user_plans') as plans,to_regclass('plan_revisions') as revisions,to_regclass('training_preferences') as prefs",
    )
    expect(left.rows[0]).toEqual({ plans: null, revisions: null, prefs: null })
    const fns = await db.query(
      "select proname from pg_proc where proname in('commit_plan','save_training_preferences','rsvp_shared_run','update_shared_run')",
    )
    expect(fns.rows).toHaveLength(0)
    const adapt = await db.query<any>(
      "select status from background_jobs where kind='adapt' and scope='70'",
    )
    expect(adapt.rows).toEqual([{ status: 'done' }])
  })
  it('clears shared-run RSVPs when a member leaves without plan tables', async () => {
    const event = '30000000-0000-0000-0000-000000000001'
    await db.query(
      `insert into shared_runs(id,group_id,creator_id,title,starts_at,meeting_point,options) values($1,$2,1,'Group run','2026-10-01T00:00:00Z','Park','[]')`,
      [event, group],
    )
    await db.query(
      'insert into shared_run_rsvps(run_id,athlete_id,option_index) values($1,2,0)',
      [event],
    )
    await db.query(
      'delete from group_members where group_id=$1 and athlete_id=2',
      [group],
    )
    const r = await db.query(
      'select * from shared_run_rsvps where athlete_id=2',
    )
    expect(r.rows).toHaveLength(0)
  })
  it('does not expose privileged RPCs to browser database roles', async () => {
    await db.exec('set role anon')
    try {
      await expect(
        db.query('select claim_job(gen_random_uuid())'),
      ).rejects.toThrow('permission denied')
    } finally {
      await db.exec('reset role')
    }
  })
})

describe('cache and input concurrency', () => {
  it('commits estimate bundles and snapshots atomically by data version', async () => {
    await db.exec(
      'insert into athlete_state(athlete_id,data_version) values(80,2)',
    )
    const bundle = {
      modelVersion: 'test-v1',
      updatedAt: '2026-09-13T02:00:00Z',
      dataVersion: 2,
      estimates: [
        {
          distanceKey: '5k',
          expectedSecs: 1500,
          idealSecs: 1450,
          lowSecs: 1400,
          highSecs: 1600,
        },
      ],
    }
    expect(
      (
        await db.query<any>('select commit_estimates(80,1,$1) as ok', [
          JSON.stringify(bundle),
        ])
      ).rows[0].ok,
    ).toBe(false)
    expect(
      (
        await db.query<any>('select commit_estimates(80,2,$1) as ok', [
          JSON.stringify(bundle),
        ])
      ).rows[0].ok,
    ).toBe(true)
    await db.query('select commit_estimates(80,2,$1)', [
      JSON.stringify({ ...bundle, modelVersion: 'test-v2' }),
    ])
    expect(
      (await db.query('select * from estimate_snapshots where athlete_id=80'))
        .rows,
    ).toHaveLength(2)
    await db.query('select commit_estimates(80,2,$1)', [
      JSON.stringify({ ...bundle, modelVersion: 'test-v2', estimates: [] }),
    ])
    expect(
      (
        await db.query<any>(
          'select secs_5k from user_latest_estimates where athlete_id=80',
        )
      ).rows[0].secs_5k,
    ).toBeNull()
  })
  it('coalesces archive invalidations without losing newest work', async () => {
    await db.exec(
      'insert into athlete_state(athlete_id,data_version) values(81,1);update athlete_state set data_version=2 where athlete_id=81;update athlete_state set data_version=3 where athlete_id=81;',
    )
    const jobs = (
      await db.query<any>(
        "select kind,input_version from background_jobs where scope='81' and status='queued'",
      )
    ).rows
    expect(jobs).toHaveLength(1)
    expect(jobs[0].kind).toBe('estimates')
    expect(jobs[0].input_version.startsWith('3:')).toBe(true)
  })
  it('resumes the same history cursor after reconnecting', async () => {
    await db.exec(
      "insert into history_imports(athlete_id,before_epoch,page,status) values(82,1000,7,'reconnect_required');insert into background_jobs(kind,scope,input_version,status) values('history','82','1000:7','done');select reconnect_history(82);",
    )
    expect(
      (
        await db.query<any>(
          "select status from background_jobs where scope='82'",
        )
      ).rows[0].status,
    ).toBe('queued')
    expect(
      (
        await db.query<any>(
          'select page from history_imports where athlete_id=82',
        )
      ).rows[0].page,
    ).toBe(7)
  })
  it('attaches results only to an owned run at the race date and distance', async () => {
    await db.exec(
      "insert into activities(id,athlete_id,type,start_date,distance,moving_time) values(999001,84,'Run','2026-09-10T01:00:00Z',10000,2900);",
    )
    await expect(
      db.exec(
        "insert into user_goals(athlete_id,distance_key,race_date,target_secs,result_secs,result_activity_id) values(85,'10k','2026-09-10',3000,3100,999001)",
      ),
    ).rejects.toThrow('Choose your recorded run')
    await db.exec(
      "insert into user_goals(athlete_id,distance_key,race_date,target_secs,result_secs,result_activity_id) values(84,'10k','2026-09-10',3000,3100,999001)",
    )
    expect(
      (
        await db.query<any>(
          'select official_result_secs from activities where id=999001',
        )
      ).rows[0].official_result_secs,
    ).toBe(3100)
  })
})

it('aggregates daily run counts and preserves the best effort identity', async () => {
  await db.exec(
    `insert into activities(id,athlete_id,type,start_date,distance,moving_time,laps) values(998001,93,'Run','2026-09-01T01:00:00Z',5000,1500,'[{"distance":400,"moving_time":80,"average_speed":5}]'),(998002,93,'Run','2026-09-01T08:00:00Z',6000,1800,'[{"distance":400,"moving_time":100,"average_speed":4}]');`,
  )
  const days = (
    await db.query<any>(
      "select group_daily_context(array[93]::bigint[],'2026-09-01','2026-09-03') as days",
    )
  ).rows[0].days
  expect(days).toHaveLength(1)
  expect(days[0].source_count).toBe(2)
  expect(days[0].distance).toBe(11000)
  expect(days[0].best_challenge.activityId).toBe(998001)
  expect(days[0].laps).toBeUndefined()
})
