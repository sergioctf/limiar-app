// Disposable PostgreSQL fixture. It never reads .env or contacts Supabase.
// Point LIMIAR_PGLITE_PATH at a directory with @electric-sql/pglite installed.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { join } from "node:path";

const deps = process.env.LIMIAR_PGLITE_PATH;
if (!deps) throw new Error("Set LIMIAR_PGLITE_PATH to the isolated test dependency directory.");
const { PGlite } = createRequire(join(deps, "package.json"))("@electric-sql/pglite");
const db = new PGlite();
const migration = async name => db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
const rows = async (sql, params) => (await db.query(sql, params)).rows;

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $uid$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $uid$;
    grant usage on schema auth to authenticated;
    create function public.uuid_generate_v4() returns uuid language sql as 'select gen_random_uuid()';
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      raw_user_meta_data jsonb
    );
    create table public.profiles (id uuid primary key references auth.users);
    create table public.coach_reports (user_id uuid, period_type text, full_report text);
    create table public.runs (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users, date date, deleted_at timestamptz);
    create table public.activities (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users,
      date date not null,
      sport_type text not null,
      name text not null,
      source text not null,
      duration_seconds integer,
      strava_raw_json jsonb,
      deleted_at timestamptz
    );
  `);
  await migration("015_invite_codes");
  await migration("017_strength_logs");
  await migration("041_signup_invite");
  await db.exec(`
    insert into invite_codes(code, max_uses, expires_at) values
      ('single',1,null), ('expired',1,now() - interval '1 second'), ('rollback',1,null), ('second',1,null);
  `);

  const signup = (email, invite) => rows(
    "insert into auth.users(email,raw_user_meta_data) values ($1,$2) returning id,raw_user_meta_data",
    [email, JSON.stringify({ signup_invite: invite, name: "Fixture" })],
  );
  await assert.rejects(signup("bad@fixture.test", null), /Invalid signup invite/);
  await assert.rejects(signup("bad@fixture.test", "%"), /Invalid signup invite/);
  await assert.rejects(signup("bad@fixture.test", "expired"), /Invalid signup invite/);
  const [athlete] = await signup("a@fixture.test", "SINGLE");
  assert.deepEqual(athlete.raw_user_meta_data, { name: "Fixture" });
  await assert.rejects(signup("b@fixture.test", "single"), /Invalid signup invite/);
  await assert.rejects(signup("a@fixture.test", "rollback"), /duplicate key/);
  assert.equal((await rows("select used_count from invite_codes where code='rollback'"))[0].used_count, 0);
  const [other] = await signup("b@fixture.test", "second");

  await db.query("insert into profiles(id) values ($1),($2)", [athlete.id, other.id]);
  await db.query("insert into coach_reports values ($1,'week','fixture')", [athlete.id]);
  await migration("042_onboarding_completion");
  assert.ok((await rows("select onboarding_completed_at from profiles where id=$1", [athlete.id]))[0].onboarding_completed_at);
  assert.equal((await rows("select onboarding_completed_at from profiles where id=$1", [other.id]))[0].onboarding_completed_at, null);

  await migration("043_strength_session_activity");
  const date = "2026-11-09";
  const sets = JSON.stringify([{ exercise_id: "fixture", set_index: 1, weight_kg: 20, reps: 8, rir: 2 }]);
  const record = (id, day = date, series = sets) => rows(
    "select record_strength_session($1,$2,$3,($2::date::text||'T14:00:00Z')::timestamptz,($2::date::text||'T14:30:00Z')::timestamptz) as id",
    [id, day, series],
  );
  const imported = (id, day, time) => rows(
    "insert into activities(user_id,date,sport_type,name,source,duration_seconds,strava_raw_json) values ($1,$2,'WeightTraining','Relogio','strava',1800,$3) returning id",
    [id, day, JSON.stringify({ start_date: `${day}T${time}Z` })],
  );
  const active = (id, day = date) => rows("select id,source,strength_log_date from activities where user_id=$1 and date=$2 and deleted_at is null", [id, day]);

  const [first] = await record(athlete.id);
  assert.equal((await record(athlete.id))[0].id, first.id);
  assert.equal((await active(athlete.id)).length, 1);
  await imported(other.id, date, "14:02:00");
  assert.equal((await active(athlete.id))[0].source, "manual");
  const [watch] = await imported(athlete.id, date, "14:02:00");
  const activeAfterSync = await active(athlete.id);
  assert.equal(activeAfterSync.length, 1);
  assert.equal(activeAfterSync[0].id, watch.id);
  assert.ok(activeAfterSync[0].strength_log_date);
  assert.equal((await rows("select count(*)::integer as n from strength_logs where user_id=$1", [athlete.id]))[0].n, 1);
  await imported(athlete.id, date, "18:00:00");
  assert.equal((await active(athlete.id)).length, 2);

  const next = "2026-11-10";
  const [watchFirst] = await imported(athlete.id, next, "14:02:00");
  assert.equal((await record(athlete.id, next))[0].id, watchFirst.id);
  assert.equal((await active(athlete.id, next)).length, 1);
  const duplicate = JSON.stringify([...JSON.parse(sets), ...JSON.parse(sets)]);
  await assert.rejects(record(athlete.id, "2026-11-11", duplicate), /cannot affect row a second time/);
  assert.equal((await active(athlete.id, "2026-11-11")).length, 0);

  await migration("028_run_feedback");
  await migration("030_run_feedback_hard_reasons");
  await migration("032_run_feedback_defer_execution");
  await migration("044_debrief");

  const [run] = await rows("insert into runs(user_id) values ($1) returning id", [athlete.id]);
  await db.query("insert into run_feedback(run_id,user_id,status,effort,context,rpe,perception) values ($1,$2,'answered',4,'weather',0,'heavy')", [run.id, athlete.id]);
  assert.equal((await rows("select rpe from run_feedback where run_id=$1", [run.id]))[0].rpe, 0);
  await assert.rejects(db.query("update run_feedback set rpe=11 where run_id=$1", [run.id]), /check constraint/);
  await assert.rejects(db.query("update run_feedback set status='deferred' where run_id=$1", [run.id]), /Feedback is already answered/);

  await db.exec("grant select on activities, runs to authenticated; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [athlete.id]);
  await db.query("insert into activity_feedback(activity_id,user_id,status,perception,reason,rpe) values ($1,$2,'answered','moderate','weather',6)", [watch.id, athlete.id]);
  assert.equal((await rows("select rpe from activity_feedback where activity_id=$1", [watch.id]))[0].rpe, 6);
  await db.query("update activity_feedback set rpe=7 where activity_id=$1", [watch.id]);
  assert.equal((await rows("select answers from debrief_revisions where activity_id=$1", [watch.id]))[0].answers.rpe, 6);
  await assert.rejects(db.query("update activity_feedback set status='deferred' where activity_id=$1", [watch.id]), /Feedback is already answered/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other.id]);
  assert.equal((await rows("select activity_id from activity_feedback where activity_id=$1", [watch.id])).length, 0);
  assert.equal((await rows("select activity_id from debrief_revisions where activity_id=$1", [watch.id])).length, 0);
  await assert.rejects(db.query("insert into activity_feedback(activity_id,user_id,status) values ($1,$2,'deferred')", [watch.id, other.id]), /row-level security/);
  await db.exec("reset role");

  await migration("045_session_activity_links");
  const link = (owner, activity, day = date) => db.query(
    "insert into session_activity_links(user_id,session_date,sport,session_type,activity_id,planned) values ($1,$2,'musculacao','strength',$3,'{}') on conflict (user_id,session_date,sport) do update set activity_id=excluded.activity_id",
    [owner, day, activity],
  );
  await assert.rejects(link(other.id, watch.id), /Activity no longer belongs/);
  await assert.rejects(link(athlete.id, watch.id, next), /Activity no longer belongs/);
  await assert.rejects(link(athlete.id, first.id), /Activity no longer belongs/);
  await link(athlete.id, watch.id);
  const [sameDayExtra] = await rows("select id from activities where user_id=$1 and date=$2 and deleted_at is null and id<>$3", [athlete.id, date, watch.id]);
  await link(athlete.id, sameDayExtra.id);
  const assigned = await rows("select activity_id from session_activity_links where user_id=$1 and session_date=$2", [athlete.id, date]);
  assert.deepEqual(assigned, [{ activity_id: sameDayExtra.id }]);
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other.id]);
  assert.equal((await rows("select * from session_activity_links")).length, 0);
  await assert.rejects(link(other.id, watch.id), /permission denied/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [athlete.id]);
  assert.equal((await rows("select * from session_activity_links")).length, 1);
  await db.exec("reset role");
  await db.query("delete from session_activity_links where user_id=$1 and session_date=$2", [athlete.id, date]);
  assert.equal((await rows("select * from session_activity_links")).length, 0);

  console.log("PostgreSQL fixture passed: invite, onboarding, strength, Debrief and session link ownership, date, replacement and removal.");
} finally {
  await db.close();
}
