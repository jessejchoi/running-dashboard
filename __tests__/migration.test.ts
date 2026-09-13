import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
let db: PGlite
const group = '10000000-0000-0000-0000-000000000001',
  session = '20000000-0000-0000-0000-000000000001'
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
 create table estimate_snapshots(athlete_id bigint,distance_key text,estimated_secs int,snapshotted_at date,unique(athlete_id,distance_key,snapshotted_at));
 create table user_plans(id uuid primary key default gen_random_uuid(),athlete_id bigint,plan_date date,session_index int default 0,session_type text,description text,target_distance_meters numeric,created_at timestamptz default now(),updated_at timestamptz default now(),constraint user_plans_athlete_id_plan_date_session_index_key unique(athlete_id,plan_date,session_index));
 create table group_coach_briefings(group_id uuid unique,content_json jsonb,generated_at timestamptz);
 create table group_challenges(id uuid primary key default gen_random_uuid(),group_id uuid,name text);
 `)
  const sql = readFileSync('supabase/migration_021.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql)
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
async function commit(
  aid: number,
  version: number,
  rows: any[],
  deletes: string[] = [],
  auto = false,
  dataVersion: number | null = null,
) {
  return db.query('select commit_plan($1,$2,$3,$4,$5,$6,$7,$8) as version', [
    aid,
    version,
    dataVersion,
    JSON.stringify(rows),
    deletes,
    'Test revision',
    auto,
    '2026-09-13',
  ])
}
function row(id = session) {
  return {
    id,
    plan_date: '2026-09-15',
    session_type: 'easy',
    config: { name: 'Workout', blocks: [] },
    target_distance_meters: 5000,
    source: 'manual',
    locked: true,
  }
}
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
  it('commits complete workouts and rejects stale updates atomically', async () => {
    await commit(1, 0, [row()])
    await expect(
      commit(1, 0, [{ ...row(), description: 'stale' }]),
    ).rejects.toThrow('STALE_VERSION')
    const r = await db.query('select config from user_plans where id=$1', [
      session,
    ])
    expect((r.rows[0] as any).config.name).toBe('Workout')
  })
  it('blocks cross-athlete modification and deletion', async () => {
    await expect(commit(2, 0, [row()])).rejects.toThrow('Not your session')
    await expect(commit(2, 0, [], [session])).rejects.toThrow(
      'Not your session',
    )
  })
  it('protects manual sessions from automatic changes', async () => {
    await expect(
      commit(1, 1, [{ ...row(), description: 'overwrite' }], [], true),
    ).rejects.toThrow('Protected session')
  })
  it('rejects jobs based on stale activity input', async () => {
    await expect(commit(1, 1, [], [], true, -1)).rejects.toThrow(
      'STALE_VERSION',
    )
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
  it('flags shared-plan changes without moving a member workout', async () => {
    const event = '30000000-0000-0000-0000-000000000001'
    await db.query(
      `insert into shared_runs(id,group_id,creator_id,title,starts_at,meeting_point,options) values($1,$2,1,'Group run','2026-10-01T00:00:00Z','Park',$3)`,
      [
        event,
        group,
        JSON.stringify([{ label: 'Easy', distance_km: 5, pace: 'Easy' }]),
      ],
    )
    await db.query('select rsvp_shared_run($1,$2,2,1,0,true,true,false,0)', [
      group,
      event,
    ])
    const before = await db.query(
      'select plan_date from user_plans where athlete_id=2',
    )
    await db.query('select update_shared_run($1,$2,1,1,$3,false)', [
      group,
      event,
      JSON.stringify({
        title: 'Updated',
        starts_at: '2026-10-02T00:00:00Z',
        timezone: 'Asia/Jakarta',
        meeting_point: 'Park',
        description: '',
        options: [{ label: 'Easy', distance_km: 6, pace: 'Easy' }],
      }),
    ])
    const after = await db.query(
      'select plan_date,event_changed from user_plans where athlete_id=2',
    )
    expect((after.rows[0] as any).plan_date).toEqual(
      (before.rows[0] as any).plan_date,
    )
    expect((after.rows[0] as any).event_changed).toBe(true)
    await expect(
      db.query('select update_shared_run($1,$2,2,2,$3,true)', [
        group,
        event,
        '{}',
      ]),
    ).rejects.toThrow('Not allowed')
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
        "select input_version from background_jobs where scope='81' and status='queued'",
      )
    ).rows
    expect(jobs).toHaveLength(2)
    expect(jobs.every((j) => j.input_version.startsWith('3:'))).toBe(true)
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
  it('rejects a missing plan version and stale preference writes', async () => {
    await expect(commit(83, null as any, [])).rejects.toThrow('STALE_VERSION')
    await db.query('select save_training_preferences(83,0,$1)', [
      JSON.stringify({ days: [1] }),
    ])
    await expect(
      db.query('select save_training_preferences(83,0,$1)', [
        JSON.stringify({ days: [2] }),
      ]),
    ).rejects.toThrow('STALE_VERSION')
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

it('keeps linked session revisions and rejects stale event acceptance', async () => {
  const event = '30000000-0000-0000-0000-000000000099'
  await db.exec(
    `insert into group_members values('${group}',91,'member'),('${group}',92,'member');insert into shared_runs(id,group_id,creator_id,title,starts_at,meeting_point,options) values('${event}','${group}',91,'Evening run','2026-10-03T01:00:00Z','Park','[{"label":"Easy","distance_km":5,"pace":"Easy"}]');`,
  )
  await db.query('select rsvp_shared_run($1,$2,92,1,0,true,true,false,0)', [
    group,
    event,
  ])
  const saved = (
    await db.query<any>(
      'select config,locked from user_plans where athlete_id=92',
    )
  ).rows[0]
  expect(saved.config.blocks[0].distanceM).toBe(5000)
  expect(saved.locked).toBe(true)
  expect(
    (await db.query('select * from plan_revisions where athlete_id=92')).rows,
  ).toHaveLength(1)
  await db.exec(
    `delete from group_members where group_id='${group}' and athlete_id=91`,
  )
  await db.query('select update_shared_run($1,$2,1,1,$3,true)', [
    group,
    event,
    '{}',
  ])
  await expect(
    db.query('select rsvp_shared_run($1,$2,92,1,0,true,true,true,1)', [
      group,
      event,
    ]),
  ).rejects.toThrow('STALE_VERSION')
  await expect(
    db.query('select rsvp_shared_run($1,$2,92,2,0,true,true,true,2)', [
      group,
      event,
    ]),
  ).rejects.toThrow('Event cancelled')
  expect(
    (await db.query('select * from user_plans where athlete_id=92')).rows,
  ).toHaveLength(1)
  await db.query('select rsvp_shared_run($1,$2,92,2,0,false,false,true,2)', [
    group,
    event,
  ])
  expect(
    (await db.query('select * from user_plans where athlete_id=92')).rows,
  ).toHaveLength(0)
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
