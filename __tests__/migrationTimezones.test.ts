import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'

let db: PGlite
const run = (id: number, athlete: number, utc: string, local: string, zone: string, meters = 5000) =>
  db.query(
    `insert into activities(id,athlete_id,type,start_date,distance,moving_time,total_elevation_gain,raw)
     values($1,$2,'Run',$3,$4,1800,10,$5)`,
    [id, athlete, utc, meters, JSON.stringify({ start_date_local: local, timezone: zone })],
  )

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table activities(id bigint primary key,athlete_id bigint,type text,start_date timestamptz,distance numeric,
  moving_time int,total_elevation_gain numeric,raw jsonb,best_challenge jsonb,official_result_secs int);
 create table user_profiles(athlete_id bigint primary key);
 create table user_goals(id uuid primary key default gen_random_uuid(),athlete_id bigint,distance_key text,
  race_date date,result_secs int,result_activity_id bigint,timezone text not null default 'Asia/Jakarta');
 insert into user_profiles values(1),(2);`)
  // An activity synced before the migration gets backfilled.
  await run(1, 1, '2026-09-25T23:03:06Z', '2026-09-26T06:03:06Z', '(GMT+07:00) Asia/Jakarta')
  const sql = readFileSync('supabase/migration_023.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql)
}, 30000)
afterAll(async () => {
  await db?.close()
})

it('backfills and maintains local start times and zones', async () => {
  await run(2, 2, '2026-09-26T04:00:00Z', '2026-09-25T21:00:00Z', '(GMT-07:00) America/Los_Angeles')
  const { rows } = await db.query<any>(
    `select id, start_date_local::date::text as day, timezone from activities order by id`)
  expect(rows).toEqual([
    { id: 1, day: '2026-09-26', timezone: 'Asia/Jakarta' },
    { id: 2, day: '2026-09-25', timezone: 'America/Los_Angeles' },
  ])
})

it('tracks each athlete\'s zone from their latest activity only', async () => {
  await run(3, 2, '2026-09-20T15:00:00Z', '2026-09-20T22:00:00Z', '(GMT+07:00) Asia/Jakarta')
  await run(4, 1, '2026-09-26T10:00:00Z', '2026-09-26T03:00:00Z', '(GMT-07:00) America/Los_Angeles')
  const { rows } = await db.query<any>('select athlete_id, timezone from user_profiles order by athlete_id')
  expect(rows).toEqual([
    { athlete_id: 1, timezone: 'America/Los_Angeles' },
    { athlete_id: 2, timezone: 'America/Los_Angeles' },
  ])
})

it('buckets totals and daily context by each run\'s local date', async () => {
  const { rows: [totals] } = await db.query<any>(
    `select coach_range_totals(array[1,2]::bigint[], $1::jsonb) as t`,
    [JSON.stringify([{ key: 'day', range_start: '2026-09-25', range_end: '2026-09-26' }])],
  )
  const byAthlete = Object.fromEntries(totals.t.map((r: any) => [r.athlete_id, Number(r.runs)]))
  expect(byAthlete).toEqual({ 1: 0, 2: 1 })

  const { rows: [ctx] } = await db.query<any>(
    `select group_daily_context(array[1]::bigint[], '2026-09-01', '2026-10-01') as c`)
  expect(ctx.c.map((r: any) => [r.start_date_local, Number(r.source_count)])).toEqual([['2026-09-26', 2]])
})

it('still reads the pre-migration app\'s Jakarta-midnight range instants', async () => {
  // The old app's "Sep 25 only" range: Jakarta midnights sent as UTC instants.
  const { rows: [totals] } = await db.query<any>(
    `select coach_range_totals(array[2]::bigint[], $1::jsonb) as t`,
    [JSON.stringify([{ key: 'day', range_start: '2026-09-24T17:00:00.000Z', range_end: '2026-09-25T17:00:00.000Z' }])],
  )
  expect(Number(totals.t[0].runs)).toBe(1)
})

it('ignores unknown Strava zone labels', async () => {
  await run(5, 2, '2026-09-27T00:00:00Z', '2026-09-27T00:00:00Z', 'nonsense')
  const { rows: [row] } = await db.query<any>(
    'select timezone, start_date_local::text as local from activities where id = 5')
  expect(row).toEqual({ timezone: null, local: '2026-09-27 00:00:00' })
})
