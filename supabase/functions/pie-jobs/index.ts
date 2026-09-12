import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const TEAM_SLUG = "drobinhood1";
const TEAM_ID = "team_LxqzlcZa969N5n9I9VzwYlns";
const PROJECT_ID = "prj_UNamKUXBj3xsrjUtqhTt4Sew3OMk";
const PROJECT_NAME = "ai-songs";
const ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`;
const AUDIENCE = `https://vercel.com/${TEAM_SLUG}`;
const JWKS = createRemoteJWKSet(new URL("/.well-known/jwks", ISSUER));
const JOB_TYPES = new Set(["song_generation","stem_separation","voice_conversion","sheet_transcription","video_generation","originality_analysis","venue_import"]);


// These three authenticated identities belong to the same Pie owner.
const PIE_OWNER_IDS = ["pie-primary", "user_3JCFRuy8lxa1w0d7a59MAznPXBZ", "user_3JFNRykFY9nfjkxHkVkUBvPA34P"];
function ownerScope(userId: string) { return PIE_OWNER_IDS.includes(userId) ? PIE_OWNER_IDS : [userId]; }
function sharedOwnerId(userId: string) { return PIE_OWNER_IDS.includes(userId) ? PIE_OWNER_IDS[1] : userId; }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function validUserId(value: string) { return value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value); }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
async function verifyProject(req: Request) {
  const token = req.headers.get("x-pie-vercel-oidc") || "";
  if (!token) throw new Error("Missing Pie project identity.");
  const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: AUDIENCE });
  if (payload.owner_id !== TEAM_ID || payload.project_id !== PROJECT_ID || payload.project !== PROJECT_NAME) throw new Error("Untrusted Pie project identity.");
  if (payload.environment !== "production" && payload.environment !== "preview") throw new Error("Untrusted Pie environment.");
  return payload.environment;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  let environment: string;
  try { environment = await verifyProject(req); } catch (error) { return json({ error: error instanceof Error ? error.message : "Authentication failed." }, 401); }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "verifyWorkerToken") {
      const token = String(body?.token || "");
      const { data, error } = await supabase.rpc("pie_verify_worker_token", { p_token: token });
      if (error) throw error;
      return json({ valid: data === true });
    }

    if (action === "enqueue") {
      const userId = String(body?.userId || "").trim();
      const type = String(body?.type || "").trim().slice(0, 80);
      const idempotencyKey = String(body?.idempotencyKey || "").trim().slice(0, 180);
      const provider = body?.provider ? String(body.provider).slice(0, 80) : null;
      const maxAttempts = Math.max(1, Math.min(Number(body?.maxAttempts || 3), 20));
      const payload = body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {};
      if (!validUserId(userId) || !JOB_TYPES.has(type) || !idempotencyKey) return json({ error: "Invalid job request." }, 400);
      const { data, error } = await supabase.from("pie_jobs").upsert({ user_id: userId, type, input: payload, idempotency_key: idempotencyKey, provider, max_attempts: maxAttempts }, { onConflict: "user_id,type,idempotency_key", ignoreDuplicates: true }).select("*").maybeSingle();
      if (error) throw error;
      if (data) return json({ job: data });
      const existing = await supabase.from("pie_jobs").select("*").eq("user_id", userId).eq("type", type).eq("idempotency_key", idempotencyKey).single();
      if (existing.error) throw existing.error;
      return json({ job: existing.data });
    }

    if (action === "list") {
      const userId = String(body?.userId || "").trim();
      if (!validUserId(userId)) return json({ error: "Invalid user identity." }, 400);
      const limit = Math.max(1, Math.min(Number(body?.limit || 30), 100));
      const { data, error } = await supabase.from("pie_jobs").select("*").in("user_id", ownerScope(userId)).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return json({ jobs: data || [] });
    }

    if (action === "get") {
      const userId = String(body?.userId || "").trim();
      const jobId = String(body?.jobId || "").trim();
      if (!validUserId(userId) || !validUuid(jobId)) return json({ error: "Invalid job request." }, 400);
      const { data, error } = await supabase.from("pie_jobs").select("*").eq("id", jobId).in("user_id", ownerScope(userId)).maybeSingle();
      if (error) throw error;
      return json({ job: data || null });
    }

    if (action === "claimOne") {
      const jobId = String(body?.jobId || "").trim();
      if (!validUuid(jobId)) return json({ error: "Invalid job id." }, 400);
      const { data, error } = await supabase.rpc("pie_claim_job", { p_job_id: jobId, p_worker_id: String(body?.workerId || "worker").slice(0,120), p_lease_seconds: Math.max(30, Math.min(Number(body?.leaseSeconds || 300),3600)) });
      if (error) throw error;
      return json({ job: Array.isArray(data) && data.length ? data[0] : null });
    }

    if (action === "claimMany") {
      const types = Array.isArray(body?.types) ? body.types.map((v: unknown) => String(v)).filter((v: string) => JOB_TYPES.has(v)) : [];
      if (!types.length) return json({ error: "No valid job types." }, 400);
      const { data, error } = await supabase.rpc("pie_claim_jobs", { p_worker_id: String(body?.workerId || "worker").slice(0,120), p_limit: Math.max(1, Math.min(Number(body?.limit || 2),20)), p_lease_seconds: Math.max(30, Math.min(Number(body?.leaseSeconds || 300),3600)), p_types: types });
      if (error) throw error;
      return json({ jobs: data || [] });
    }

    if (action === "consumeUsage") {
      const jobId = String(body?.jobId || "").trim();
      if (!validUuid(jobId)) return json({ error: "Invalid job id." }, 400);
      const job = await supabase.from("pie_jobs").select("user_id").eq("id", jobId).single();
      if (job.error) throw job.error;
      if (job.data.user_id === "pie-primary" || (environment === "production" && job.data.user_id === "user_3JFNRykFY9nfjkxHkVkUBvPA34P")) {
        const metered = await supabase.rpc("pie_owner_meter", { p_environment: environment, p_user_id: job.data.user_id, p_action: "consumeJob", p_body: { jobId, usageKey: body.usageKey, units: body.units || 1 } });
        if (metered.error) throw metered.error;
        return json({ usage: metered.data });
      }
      const { data, error } = await supabase.rpc("pie_consume_job_usage", { p_job_id: jobId, p_usage_key: String(body?.usageKey || "").slice(0,80), p_free_limit: Number(body?.freeLimit || 0), p_units: Math.max(1, Math.min(Number(body?.units || 1),100)) });
      if (error) throw error;
      return json({ usage: data || {} });
    }

    if (action === "markSucceeded") {
      const jobId = String(body?.jobId || "").trim();
      if (!validUuid(jobId)) return json({ error: "Invalid job id." }, 400);
      const { data, error } = await supabase.from("pie_jobs").update({ status: "succeeded", output: body?.output || {}, completed_at: new Date().toISOString(), lease_expires_at: null, locked_by: null, locked_at: null, last_error_code: null, last_error_message: null, updated_at: new Date().toISOString() }).eq("id", jobId).select("*").single();
      if (error) throw error;
      return json({ job: data });
    }

    if (action === "markFailed") {
      const jobId = String(body?.jobId || "").trim();
      if (!validUuid(jobId)) return json({ error: "Invalid job id." }, 400);
      const current = await supabase.from("pie_jobs").select("*").eq("id", jobId).single();
      if (current.error) throw current.error;
      const job = current.data;
      const retryable = Boolean(body?.retryable);
      const exhausted = Number(job.attempt_count) >= Number(job.max_attempts);
      const shouldRetry = retryable && !exhausted;
      const delaySeconds = Math.min(900, Math.max(10, 15 * 2 ** Math.max(0, Number(job.attempt_count) - 1)));
      const update = await supabase.from("pie_jobs").update({ status: shouldRetry ? "retrying" : "failed", next_attempt_at: shouldRetry ? new Date(Date.now()+delaySeconds*1000).toISOString() : job.next_attempt_at, completed_at: shouldRetry ? null : new Date().toISOString(), lease_expires_at: null, locked_by: null, locked_at: null, last_error_code: String(body?.errorCode || "job_failed").slice(0,100), last_error_message: String(body?.errorMessage || "Job failed.").slice(0,1500), updated_at: new Date().toISOString() }).eq("id", jobId).select("*").single();
      if (update.error) throw update.error;
      return json({ job: update.data });
    }

    if (action === "createUpload") {
      const jobId = String(body?.jobId || "").trim();
      if (!validUuid(jobId)) return json({ error: "Invalid job id." }, 400);
      const current = await supabase.from("pie_jobs").select("user_id,status").eq("id", jobId).single();
      if (current.error) throw current.error;
      if (current.data.status !== "running") return json({ error: "Job is not running." }, 409);
      const path = `${current.data.user_id}/${jobId}.mp3`;
      const signed = await supabase.storage.from("pie-job-output").createSignedUploadUrl(path, { upsert: true });
      if (signed.error) throw signed.error;
      return json({ path, token: signed.data.token });
    }

    if (action === "createDownload") {
      const userId = String(body?.userId || "").trim();
      const jobId = String(body?.jobId || "").trim();
      if (!validUserId(userId) || !validUuid(jobId)) return json({ error: "Invalid job request." }, 400);
      const current = await supabase.from("pie_jobs").select("user_id,status,output").eq("id", jobId).in("user_id", ownerScope(userId)).maybeSingle();
      if (current.error) throw current.error;
      if (!current.data || current.data.status !== "succeeded") return json({ error: "Job output is not ready." }, 409);
      const path = String(current.data.output?.path || "");
      if (!path.startsWith(`${current.data.user_id}/`)) return json({ error: "Invalid output path." }, 403);
      const signed = await supabase.storage.from("pie-job-output").createSignedUrl(path, 60);
      if (signed.error) throw signed.error;
      return json({ signedUrl: signed.data.signedUrl, contentType: String(current.data.output?.contentType || "audio/mpeg") });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("pie-jobs", error);
    return json({ error: error instanceof Error ? error.message : "Pie job service failed." }, 500);
  }
});
