import { Client } from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";

const allowedOrigins = new Set([
  "https://fd.focom-iliad.fr",
  "https://fd.linux92fr.workers.dev",
  "https://fd-preview.linux92fr.workers.dev",
]);
const authJwksCache = new Map();
function getNeonAuthConfig(env) {
  const baseUrl = String(env.NEON_AUTH_URL || "").replace(/\/+$/, "");
  if (!baseUrl || !baseUrl.startsWith("https://")) throw new Error("NEON_AUTH_URL_NOT_CONFIGURED");
  let jwks = authJwksCache.get(baseUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(baseUrl + "/.well-known/jwks.json"));
    authJwksCache.set(baseUrl, jwks);
  }
  return { baseUrl, issuer: new URL(baseUrl).origin, jwks };
}
function isOriginAllowed(origin, env) {
  const configured = String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  return Boolean(origin) && configured.includes(origin);
}
const ADMIN_EMAIL = "contact@focom-iliad.fr";
const LEGACY_ADMIN_EMAIL = "free-distri@focom-iliad.fr";
const isProtectedAdminEmail = email => [ADMIN_EMAIL, LEGACY_ADMIN_EMAIL].includes(String(email || "").toLowerCase());
const HOMEPAGE_DEFAULTS = {"hero_eyebrow":"FOCOM · Free Distribution","hero_title":"La voix des salariés\ndes boutiques Free.","hero_text":"Un espace d’information, de dialogue et d’action syndicale dédié aux équipes de Free Distribution.","hero_primary_label":"Nos revendications","hero_primary_url":"#revendications","hero_secondary_label":"Nous contacter","hero_secondary_url":"/contact","intro_eyebrow":"Notre engagement","intro_title":"À vos côtés, au quotidien.","intro_text":"La vente, le conseil et l’accompagnement des clients en boutique mobilisent des compétences et un engagement essentiels. FO Free Distribution porte la parole des salariés et défend leurs intérêts professionnels.","news_eyebrow":"Restez informés","news_title":"Actualités","news_note":"Les informations dédiées à Free Distribution","claims_eyebrow":"Élections professionnelles · FO Free Distribution","claims_title":"Nos revendications","claims_lead":"Notre ambition : obtenir des avancées concrètes sur les salaires, les commissions, les conditions de travail et la reconnaissance des équipes en boutique. Voici les engagements que FO souhaite porter avec vous.","rights_eyebrow":"Mieux connaître vos droits","rights_title":"Vos droits au travail","rights_lead":"Des repères pratiques pour comprendre vos droits et savoir vers qui vous tourner. Les contenus détaillés seront publiés prochainement.","survey_eyebrow":"Votre avis compte","survey_title":"Donnez votre avis en toute confidentialité.","survey_text":"Cette consultation permet de faire remonter les attentes et les priorités des salariés de Free Distribution. Vos réponses sont enregistrées sans nom ni adresse e-mail.","hero_image":"","intro_image":"","news_image":"","claims_image":"","rights_image":"","survey_image":""};
const SURVEY_ACCESS_ISSUER = "https://linux92fr.cloudflareaccess.com";
const SURVEY_ACCESS_AUDIENCE = "e58983dc65cd10dd66fdb66e69e85c1e099f2427f9de1e8fb03b84b961bb22ed";
const SURVEY_ACCESS_JWKS = createRemoteJWKSet(new URL(SURVEY_ACCESS_ISSUER + "/cdn-cgi/access/certs"));
const SURVEY_ADMIN_EMAILS = new Set([ADMIN_EMAIL, LEGACY_ADMIN_EMAIL]);

const SITE_CONTENT_KEYS = new Set(["claims", "rights", "section_order"]);
const SITE_SECTION_ORDER = ["intro", "news", "claims", "rights", "survey", "contact"];
const SURVEY_CONFIG_DEFAULT = {
  conditions:"Comment évaluez-vous globalement vos conditions de travail ?",
  priorities:"Quels sujets devraient être prioritaires ?",
  recognition:"Vous sentez-vous reconnu(e) pour le travail que vous accomplissez ?",
  comment:"Quelle amélioration vous paraît la plus urgente ?",
  priorityOptions:[
    {value:"salary",label:"Salaires et pouvoir d'achat"},{value:"commissions",label:"Primes et commissions"},
    {value:"staffing",label:"Effectifs et moyens en boutique"},{value:"schedules",label:"Horaires et équilibre vie professionnelle / personnelle"},
    {value:"workload",label:"Charge et organisation du travail"},{value:"training",label:"Formation"},
    {value:"career",label:"Évolution professionnelle"},{value:"management",label:"Management et communication"},
    {value:"health",label:"Santé, sécurité et conditions de travail"},{value:"recognition",label:"Reconnaissance du travail"},
    {value:"other",label:"Autre sujet"}
  ]
};
export function validateSiteContent(key,value){
  const short=(v,max=240)=>typeof v==="string"&&v.length<=max;
  if(!SITE_CONTENT_KEYS.has(key)||!value||typeof value!=="object"||Array.isArray(value))return false;
  if(key==="section_order")return Array.isArray(value.order)&&value.order.length===SITE_SECTION_ORDER.length&&value.order.every((v,i,a)=>SITE_SECTION_ORDER.includes(v)&&a.indexOf(v)===i);
  if(!short(value.eyebrow,180)||!short(value.title,180)||!short(value.lead,2000))return false;
  if(key==="claims")return Array.isArray(value.items)&&value.items.length>=1&&value.items.length<=20&&value.items.every(x=>x&&short(x.icon,8)&&short(x.number,80)&&short(x.title,180)&&Array.isArray(x.bullets)&&x.bullets.length<=12&&x.bullets.every(v=>short(v,500)))&&short(value.commitmentTitle,180)&&short(value.commitmentText,2000)&&short(value.disclaimer,2000);
  return Array.isArray(value.topics)&&value.topics.length>=1&&value.topics.length<=20&&value.topics.every(x=>x&&short(x.icon,8)&&short(x.number,80)&&short(x.title,180))&&short(value.contactTitle,180)&&short(value.contactText,1000);
}
export function validateSurveyConfig(value){
  const allowed=new Set(SURVEY_CONFIG_DEFAULT.priorityOptions.map(x=>x.value));
  return value&&typeof value==="object"&&!Array.isArray(value)&&["conditions","priorities","recognition","comment"].every(k=>typeof value[k]==="string"&&value[k].trim()&&value[k].length<=300)&&Array.isArray(value.priorityOptions)&&value.priorityOptions.length===allowed.size&&value.priorityOptions.every(x=>x&&allowed.has(x.value)&&typeof x.label==="string"&&x.label.trim()&&x.label.length<=180)&&new Set(value.priorityOptions.map(x=>x.value)).size===allowed.size;
}
async function publicSiteContent(env){
  if(!env.SURVEYS_DB)return{claims:null,rights:null,section_order:null};
  const result=await env.SURVEYS_DB.prepare("SELECT content_key,content_json FROM site_content WHERE content_key IN ('claims:published','rights:published','section_order:published') AND status='published'").all();
  const data={claims:null,rights:null,section_order:null};
  for(const row of result.results||[]){const key=row.content_key.split(":")[0];try{data[key]=JSON.parse(row.content_json)}catch{}}
  return data;
}
async function publicSurveyConfig(env){
  if(!env.SURVEYS_DB)return SURVEY_CONFIG_DEFAULT;
  const row=await env.SURVEYS_DB.prepare("SELECT config_json FROM survey_configuration WHERE id=1").first();
  if(!row?.config_json)return SURVEY_CONFIG_DEFAULT;
  try{const value=JSON.parse(row.config_json);return validateSurveyConfig(value)?value:SURVEY_CONFIG_DEFAULT}catch{return SURVEY_CONFIG_DEFAULT}
}


function json(data, status = 200, origin = "") {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "content-security-policy": "default-src 'none'; frame-src 'self'; frame-ancestors 'none'",
  };
  if (allowedOrigins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function withDatabase(env, callback) {
  if (!env.HYPERDRIVE?.connectionString) throw new Error("DATABASE_NOT_CONFIGURED");
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  try {
    await client.connect();
    return await callback(client);
  } finally {
    await client.end().catch(() => {});
  }
}


async function withAdvisoryLock(env, key, callback) {
  if (!env.HYPERDRIVE?.connectionString) throw new Error("DATABASE_NOT_CONFIGURED");
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  let locked = false;
  try {
    await client.connect();
    const result = await client.query("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [key]);
    locked = result.rows[0]?.locked === true;
    if (!locked) return { lockUnavailable: true };
    return await callback();
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [key]).catch(() => {});
    await client.end().catch(() => {});
  }
}

async function requireSurveyAdmin(request) {
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!assertion) return false;
  try {
    const { payload } = await jwtVerify(assertion, SURVEY_ACCESS_JWKS, {
      issuer: SURVEY_ACCESS_ISSUER, audience: SURVEY_ACCESS_AUDIENCE,
    });
    return typeof payload.email === "string" && SURVEY_ADMIN_EMAILS.has(payload.email.toLowerCase());
  } catch (error) {
    console.warn("Survey Access JWT rejected:", error?.code || error?.name || "unknown");
    return false;
  }
}


async function newsletterSignupRateLimit(request, env) {
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (!clientIp) return { allowed: false, unavailable: true };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientIp));
  const ipHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return withDatabase(env, async db => {
    const result = await db.query(
      `INSERT INTO public.newsletter_signup_rate_limits(ip_hash,window_started_at,attempts)
       VALUES($1,NOW(),1)
       ON CONFLICT(ip_hash) DO UPDATE
       SET attempts=CASE WHEN public.newsletter_signup_rate_limits.window_started_at < NOW()-INTERVAL '15 minutes' THEN 1 ELSE public.newsletter_signup_rate_limits.attempts+1 END,
           window_started_at=CASE WHEN public.newsletter_signup_rate_limits.window_started_at < NOW()-INTERVAL '15 minutes' THEN NOW() ELSE public.newsletter_signup_rate_limits.window_started_at END
       RETURNING attempts`,
      [ipHash]
    );
    await db.query("DELETE FROM public.newsletter_signup_rate_limits WHERE window_started_at < NOW()-INTERVAL '1 day'");
    return { allowed: Number(result.rows[0]?.attempts || 0) <= 5 };
  });
}

export async function handleNewsletterSubscribe(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigins.has(origin)) return json({ error: "INVALID_ORIGIN" }, 403, origin);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return json({ error: "INVALID_CONTENT_TYPE" }, 415, origin);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
  if (typeof body.website === "string" && body.website.trim()) {
    return json({ ok: true, message: "Votre demande d’inscription a bien été prise en compte." }, 200, origin);
  }
  try {
    const limit = await newsletterSignupRateLimit(request, env);
    if (limit.unavailable) return json({ error: "RATE_LIMIT_UNAVAILABLE", message: "Inscription temporairement indisponible. Merci de réessayer." }, 503, origin);
    if (!limit.allowed) return json({ error: "TOO_MANY_REQUESTS", message: "Trop de tentatives. Merci de réessayer dans 15 minutes." }, 429, origin);
  } catch (error) {
    console.error("Newsletter rate limit failed:", error?.code || error?.name || "unknown");
    return json({ error: "RATE_LIMIT_UNAVAILABLE", message: "Inscription temporairement indisponible. Merci de réessayer." }, 503, origin);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "INVALID_EMAIL", message: "Vérifiez votre adresse e-mail." }, 400, origin);
  }
  if (body.consent_confirmed !== true) {
    return json({ error: "EXPLICIT_CONSENT_REQUIRED", message: "Cochez la case pour confirmer votre inscription à la newsletter." }, 400, origin);
  }
  try {
    const result = await withDatabase(env, db => db.query(
      `INSERT INTO public.newsletter_subscribers AS existing(email,status,subscribed_at,unsubscribed_at,consent_at,consent_source,consent_version)
       VALUES($1,'subscribed',NOW(),NULL,NOW(),'public_form','newsletter-consent-v1')
       ON CONFLICT(email) DO UPDATE SET status='subscribed',subscribed_at=NOW(),unsubscribed_at=NULL,consent_at=NOW(),consent_source='public_form',consent_version='newsletter-consent-v1'
       WHERE existing.status='subscribed' OR $2::boolean RETURNING id,status`,
      [email, body.consent_confirmed]
    ));
    if (!result.rows[0]) return json({ error: "RECONSENT_REQUIRED", message: "Cette adresse est désinscrite. Une nouvelle confirmation explicite est nécessaire." }, 409, origin);
    return json({ ok: true, message: "Votre inscription à la newsletter FO Free Distribution est bien enregistrée." }, 200, origin);
  } catch (error) {
    console.error("Newsletter subscription failed:", error?.code || error?.name || "unknown");
    return json({ error: "SUBSCRIPTION_UNAVAILABLE", message: "L’inscription n’a pas pu être enregistrée. Merci de réessayer ultérieurement." }, 503, origin);
  }
}

async function contactRateLimit(request, env) {
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (!clientIp) return { allowed: false, unavailable: true };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientIp));
  const ipHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return withDatabase(env, async db => {
    const result = await db.query(
      `INSERT INTO public.contact_rate_limits(ip_hash,window_started_at,attempts)
       VALUES($1,NOW(),1)
       ON CONFLICT(ip_hash) DO UPDATE
       SET attempts=CASE WHEN public.contact_rate_limits.window_started_at < NOW()-INTERVAL '15 minutes' THEN 1 ELSE public.contact_rate_limits.attempts+1 END,
           window_started_at=CASE WHEN public.contact_rate_limits.window_started_at < NOW()-INTERVAL '15 minutes' THEN NOW() ELSE public.contact_rate_limits.window_started_at END
       RETURNING attempts`,
      [ipHash]
    );
    await db.query("DELETE FROM public.contact_rate_limits WHERE window_started_at < NOW()-INTERVAL '1 day'");
    return { allowed: Number(result.rows[0]?.attempts || 0) <= 3 };
  });
}

export async function handleContact(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigins.has(origin)) return json({ error: "INVALID_ORIGIN" }, 403, origin);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return json({ error: "INVALID_CONTENT_TYPE" }, 415, origin);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
  if (typeof body.website === "string" && body.website.trim()) {
    return json({ ok: true, message: "Votre message a bien été envoyé." }, 200, origin);
  }

  try {
    const limit = await contactRateLimit(request, env);
    if (limit.unavailable) return json({ error: "RATE_LIMIT_UNAVAILABLE", message: "Le formulaire est temporairement indisponible. Merci de réessayer." }, 503, origin);
    if (!limit.allowed) return json({ error: "TOO_MANY_REQUESTS", message: "Vous avez atteint la limite de 3 messages en 15 minutes. Merci de réessayer plus tard." }, 429, origin);
  } catch (error) {
    console.error("Contact rate limit failed:", error?.code || error?.name || "unknown");
    return json({ error: "RATE_LIMIT_UNAVAILABLE", message: "Le formulaire est temporairement indisponible. Merci de réessayer." }, 503, origin);
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (name.length > 120 || !validEmail || email.length > 254 ||
      !subject || subject.length > 160 || message.length < 10 || message.length > 5000) {
    return json({ error: "INVALID_FIELDS", message: "Vérifiez votre adresse e-mail, l'objet et le contenu du message (10 à 5 000 caractères)." }, 400, origin);
  }

  const safeName = name.replace(/[\r\n<>]/g, " ").trim();
  const safeSubject = subject.replace(/[\r\n]/g, " ").trim();
  const textContent = [
    "Nouveau message depuis le formulaire de contact FO Free Distribution",
    "",
    "Nom : " + (safeName || "Non renseigné"),
    "Adresse de réponse : " + email,
    "Objet : " + safeSubject,
    "",
    message,
  ].join("\n");

  try {
    await withDatabase(env, db => db.query(
      "INSERT INTO public.contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)",
      [safeName || null, email, safeSubject, message]
    ));
  } catch (error) {
    console.error("Contact message storage failed:", error?.code || error?.name || "unknown");
    return json({ error: "MESSAGE_STORAGE_FAILED", message: "Votre message n'a pas pu être enregistré. Merci de réessayer ultérieurement." }, 503, origin);
  }

  if (!env.BREVO_API_KEY) {
    console.warn("Contact notification not sent: BREVO_API_KEY is missing.");
    return json({ ok: true, message: "Votre message a bien été reçu et enregistré. L'équipe FO pourra le consulter dans l'espace d'administration." }, 200, origin);
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "FO Free Distribution", email: "contact@focom-iliad.fr" },
        to: [{ email: "free-distri@focom-iliad.fr", name: "FO Free Distribution" }],
        replyTo: { email, ...(safeName ? { name: safeName } : {}) },
        subject: "[Contact site FD] " + safeSubject,
        textContent,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Brevo contact delivery failed:", response.status, detail.slice(0, 500));
      return json({ ok: true, message: "Votre message a bien été reçu et enregistré. La notification par e-mail n'a pas abouti, mais l'équipe FO pourra consulter votre message dans l'espace d'administration." }, 200, origin);
    }
    return json({ ok: true, message: "Merci, votre message a bien été envoyé à l'équipe FO." }, 200, origin);
  } catch (error) {
    console.error("Contact email request failed:", error?.name || "unknown");
    return json({ ok: true, message: "Votre message a bien été reçu et enregistré. La notification par e-mail n'a pas abouti, mais l'équipe FO pourra consulter votre message dans l'espace d'administration." }, 200, origin);
  }
}

export async function handleSurvey(request, env) {
  if (!env.SURVEYS_DB) return json({ error: "SURVEY_STORAGE_UNAVAILABLE" }, 503);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return json({ error: "INVALID_CONTENT_TYPE" }, 415);
  }
  const origin = request.headers.get("Origin");
  if (!allowedOrigins.has(origin)) {
    return json({ error: "INVALID_ORIGIN" }, 403);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
  // Honeypot: silently accept bots without storing their content.
  if (typeof body.website === "string" && body.website.trim()) {
    return json({ ok: true, message: "Merci pour votre participation." });
  }

  const conditions = Number(body.conditions);
  const recognition = Number(body.recognition);
  const allowedPriorities = new Set([
    "salary", "commissions", "staffing", "schedules", "workload",
    "training", "career", "management", "health", "recognition", "other"
  ]);
  const priorities = Array.isArray(body.priorities)
    ? [...new Set(body.priorities.filter(value => typeof value === "string" && allowedPriorities.has(value)))]
    : [];
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";

  if (!Number.isInteger(conditions) || conditions < 1 || conditions > 5 ||
      !Number.isInteger(recognition) || recognition < 1 || recognition > 5 ||
      priorities.length < 1 || priorities.length > allowedPriorities.size ||
      comment.length > 1500) {
    return json({ error: "INVALID_ANSWERS", message: "Vérifiez les réponses obligatoires et la longueur du commentaire." }, 400);
  }

  const id = crypto.randomUUID();
  const answers = JSON.stringify({ conditions, recognition, priorities, comment });
  try {
    await env.SURVEYS_DB.prepare(
      "INSERT INTO survey_responses (id, answers_json) VALUES (?, ?)"
    ).bind(id, answers).run();
    return json({ ok: true, message: "Merci pour votre participation. Votre réponse anonyme a bien été enregistrée." });
  } catch (error) {
    console.error("Survey submission failed:", error?.message || "unknown");
    return json({ error: "SURVEY_SAVE_FAILED", message: "L'enregistrement a échoué. Merci de réessayer." }, 503);
  }
}


async function surveyResults(request, env) {
  if (!await requireSurveyAdmin(request)) return json({ error: "ACCESS_DENIED" }, 403);
  try {
    const result = await env.SURVEYS_DB.prepare("SELECT created_at, answers_json FROM survey_responses ORDER BY created_at DESC").all();
    const responses = (result.results || []).map(row => {
      let answers = {};
      try { answers = JSON.parse(row.answers_json); } catch {}
      return { created_at: row.created_at, answers };
    });
    return json({ responses });
  } catch (error) {
    console.error("Survey results read failed:", error?.message || "unknown");
    return json({ error: "SURVEY_RESULTS_UNAVAILABLE" }, 503);
  }
}

function dashboardHtml() {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Résultats questionnaire · FO Free Distribution</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#22232a;font:15px system-ui,sans-serif}
header{background:#25262b;color:white;padding:22px max(5vw,20px);display:flex;justify-content:space-between;align-items:center;gap:20px}
header strong{color:#ff526b}header a{color:white;text-decoration:none}
main{max-width:1120px;margin:36px auto;padding:0 20px 70px}
h1{font-size:clamp(28px,4vw,40px);margin:8px 0}h2{font-size:20px;margin:0 0 18px}
.eyebrow{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#c8102e;font-weight:800}
.actions{display:flex;gap:10px;flex-wrap:wrap}.btn{border:0;border-radius:6px;padding:12px 16px;background:#c8102e;color:white;font-weight:700;cursor:pointer}.btn.alt{background:white;color:#24252b;border:1px solid #ddd}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:26px 0}
.card,.panel{background:white;border:1px solid #e5e6e9;border-radius:11px;padding:22px;box-shadow:0 4px 16px #20203008}
.metric{font-size:36px;font-weight:800;margin-top:8px}.muted{color:#70737d;font-size:13px;line-height:1.6}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.barrow{display:grid;grid-template-columns:minmax(130px,1fr) 2fr 35px;gap:10px;align-items:center;margin:13px 0;font-size:13px}
.track{height:12px;background:#f0f0f2;border-radius:20px;overflow:hidden}.fill{height:100%;background:#c8102e;border-radius:20px}
.comments{display:grid;gap:10px}.comment{background:#fafafa;border:1px solid #eee;border-radius:8px;padding:14px;white-space:pre-wrap;line-height:1.6}
.status{padding:15px;background:#fff4f5;border-radius:8px;color:#8d1729;margin:18px 0}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:10px;border-bottom:1px solid #eee}
@media(max-width:720px){.cards,.grid{grid-template-columns:1fr}.barrow{grid-template-columns:120px 1fr 28px}header{align-items:flex-start;flex-direction:column}}
@media print{body{background:white}header{background:white;color:#222;border-bottom:1px solid #ccc;padding:12px 0}header a,.actions{display:none!important}main{max-width:none;margin:15px 0;padding:0}.card,.panel{box-shadow:none;break-inside:avoid}.cards{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr 1fr}}
</style></head><body>
<header><div><strong>FO</strong> FOCOM · Free Distribution — Administration</div><a href="/">← Retour au site</a></header>
<main><span class="eyebrow">Consultation des salariés · production</span><h1>Résultats du questionnaire</h1>
<p class="muted">Données anonymes recueillies sur l'environnement de production. Accès réservé à l'administrateur.</p>
<div class="actions"><button class="btn" id="csv">Exporter en CSV</button><button class="btn alt" id="pdf">Imprimer / Enregistrer en PDF</button><button class="btn alt" id="refresh">Actualiser</button></div>
<div id="status" class="status">Chargement des résultats…</div>
<div id="results" hidden>
<div class="cards"><section class="card"><span class="muted">Réponses reçues</span><div class="metric" id="count">0</div></section><section class="card"><span class="muted">Note moyenne — conditions de travail</span><div class="metric" id="conditions-average">—</div></section><section class="card"><span class="muted">Note moyenne — reconnaissance</span><div class="metric" id="recognition-average">—</div></section></div>
<div class="grid"><section class="panel"><h2>Conditions de travail</h2><div id="conditions-chart"></div></section><section class="panel"><h2>Reconnaissance au travail</h2><div id="recognition-chart"></div></section></div>
<section class="panel" style="margin-top:16px"><h2>Priorités des salariés</h2><div id="priorities-chart"></div></section>
<section class="panel" style="margin-top:16px"><h2>Commentaires libres</h2><div id="comments" class="comments"></div></section>
<p class="muted" id="updated"></p></div></main>
<script>
const labels={salary:"Salaires et pouvoir d'achat",commissions:"Primes et commissions",staffing:"Effectifs et moyens en boutique",schedules:"Horaires et équilibre des temps de vie",workload:"Charge et organisation du travail",training:"Formation",career:"Évolution professionnelle",management:"Management et communication",health:"Santé, sécurité et conditions de travail",recognition:"Reconnaissance du travail",other:"Autre sujet"};
let rows=[];
const $=s=>document.querySelector(s);
function chart(target,counts,total){$(target).innerHTML=Object.entries(counts).map(([key,n])=>'<div class="barrow"><span>'+key+'</span><div class="track"><div class="fill" style="width:'+(total?n/total*100:0)+'%"></div></div><b>'+n+'</b></div>').join('')}
async function load(){
 $('#status').hidden=false;$('#status').textContent='Chargement des résultats…';$('#results').hidden=true;
 try{
  const response=await fetch('/api/admin/survey-results',{headers:{Accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error(response.status===401||response.status===403?'Accès refusé. Vérifiez votre connexion Cloudflare Access.':'Lecture des résultats impossible.');
  const data=await response.json();rows=data.responses||[];
  $('#count').textContent=rows.length;
  const c={},r={},p={};let cs=0,rs=0;
  for(let i=1;i<=5;i++){c[i]=0;r[i]=0}
  rows.forEach(row=>{const a=row.answers;c[a.conditions]=(c[a.conditions]||0)+1;r[a.recognition]=(r[a.recognition]||0)+1;(a.priorities||[]).forEach(k=>p[labels[k]||k]=(p[labels[k]||k]||0)+1);cs+=a.conditions;rs+=a.recognition});
  $('#conditions-average').textContent=rows.length?(cs/rows.length).toFixed(1).replace('.',',')+'/5':'—';
  $('#recognition-average').textContent=rows.length?(rs/rows.length).toFixed(1).replace('.',',')+'/5':'—';
  chart('#conditions-chart',c,rows.length);chart('#recognition-chart',r,rows.length);
  chart('#priorities-chart',Object.fromEntries(Object.entries(p).sort((a,b)=>b[1]-a[1])),rows.length);
  $('#comments').innerHTML=rows.filter(x=>x.answers.comment).map(x=>'<div class="comment"></div>').join('');
  const comments=[...$('#comments').children];rows.filter(x=>x.answers.comment).forEach((x,i)=>comments[i].textContent=x.answers.comment);
  if(!comments.length)$('#comments').innerHTML='<p class="muted">Aucun commentaire libre pour le moment.</p>';
  $('#updated').textContent='Dernière actualisation : '+new Date().toLocaleString('fr-FR');
  $('#status').hidden=true;$('#results').hidden=false;
 }catch(e){$('#status').textContent=e.message;$('#results').hidden=true}
}
function csv(){
 const headers=['Date de réception','Conditions de travail','Reconnaissance','Priorités','Commentaire'];
 const rowsOut=rows.map(x=>[x.created_at,x.answers.conditions,x.answers.recognition,(x.answers.priorities||[]).map(k=>labels[k]||k).join(' | '),x.answers.comment||'']);
 const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const text=[headers,...rowsOut].map(row=>row.map(quote).join(';')).join('\\r\\n');
 const blob=new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='fd-questionnaire-reponses-anonymes.csv';a.click();URL.revokeObjectURL(url);
}
$('#csv').onclick=csv;$('#pdf').onclick=()=>window.print();$('#refresh').onclick=load;load();
</script></body></html>`;
}

async function requireSiteAccess(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.length > 8192) return { denied: "TOKEN_MISSING" };
  let payload;
  try {
    const authConfig = getNeonAuthConfig(env);
    ({ payload } = await jwtVerify(token, authConfig.jwks, { issuer: authConfig.issuer }));
  } catch (error) {
    const code = String(error.code || error.name || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 64);
    console.warn("Site access JWT verification failed:", code);
    return { denied: "JWT_VERIFICATION_FAILED_" + code };
  }
  if (typeof payload.sub !== "string") return { denied: "TOKEN_SUBJECT_MISSING" };
  try {
    return await withDatabase(env, async db => {
      const result = await db.query(
        `SELECT u.id, u.email, u.name,
                CASE WHEN lower(u.email) IN (lower($2), lower($3)) THEN 'admin' ELSE COALESCE(a.role, 'employee') END AS role,
                CASE WHEN lower(u.email) IN (lower($2), lower($3)) THEN 'active' ELSE COALESCE(a.status, 'pending') END AS status
         FROM neon_auth."user" u
         LEFT JOIN public.site_user_access a ON a.user_id = u.id
         WHERE u.id = $1 AND u."emailVerified" = TRUE`,
        [payload.sub, ADMIN_EMAIL, LEGACY_ADMIN_EMAIL]
      );
      const user = result.rows[0];
      if (!user) return { denied: "USER_NOT_FOUND_OR_EMAIL_UNVERIFIED" };
      if (user.status !== "active") return { denied: user.status === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_PENDING_APPROVAL" };
      if (!["admin", "admin_delegate", "editor", "employee"].includes(user.role)) return { denied: "INVALID_SITE_ROLE" };
      return { user };
    });
  } catch (error) {
    const code = String(error.code || error.name || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 64);
    console.error("Site access database check failed:", code);
    return { denied: "DATABASE_CHECK_FAILED_" + code };
  }
}

function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180);
}


function escapeEmailHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function verifyNeonWebhook(rawBody, headers, env) {
  const signature = headers.get("x-neon-signature") || "";
  const kid = headers.get("x-neon-signature-kid") || "";
  const timestamp = headers.get("x-neon-timestamp") || "";
  if (!signature || !kid || !/^\d{10,16}$/.test(timestamp)) throw new Error("MISSING_WEBHOOK_SIGNATURE");
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    throw new Error("WEBHOOK_TIMESTAMP_INVALID");
  }

  const parts = signature.split(".");
  if (parts.length !== 3 || parts[1] !== "") throw new Error("WEBHOOK_SIGNATURE_FORMAT_INVALID");
  const [headerB64, , signatureB64] = parts;
  let protectedHeader;
  try { protectedHeader = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerB64))); }
  catch { throw new Error("WEBHOOK_SIGNATURE_HEADER_INVALID"); }
  if (protectedHeader.alg !== "EdDSA") throw new Error("WEBHOOK_SIGNATURE_ALGORITHM_INVALID");

  const authConfig = getNeonAuthConfig(env);
  const jwksResponse = await fetch(authConfig.baseUrl + "/.well-known/jwks.json", {
    headers: { "accept": "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!jwksResponse.ok) throw new Error("WEBHOOK_JWKS_UNAVAILABLE");
  const jwks = await jwksResponse.json();
  const jwk = Array.isArray(jwks.keys) ? jwks.keys.find(key => key.kid === kid && key.kty === "OKP" && key.crv === "Ed25519") : null;
  if (!jwk) throw new Error("WEBHOOK_SIGNING_KEY_NOT_FOUND");

  const payloadB64 = btoa(String.fromCharCode(...new TextEncoder().encode(rawBody)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const signaturePayload = timestamp + "." + payloadB64;
  const signaturePayloadB64 = btoa(String.fromCharCode(...new TextEncoder().encode(signaturePayload)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const signingInput = new TextEncoder().encode(headerB64 + "." + signaturePayloadB64);
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "Ed25519" }, publicKey, base64UrlToBytes(signatureB64), signingInput);
  if (!valid) throw new Error("WEBHOOK_SIGNATURE_INVALID");
  return JSON.parse(rawBody);
}

function renderOtpEmail(payload, isInitialPasswordSetup = false) {
  const email = String(payload?.user?.email || "").trim().toLowerCase();
  const name = String(payload?.user?.name || "").trim().slice(0, 120);
  const code = String(payload?.event_data?.otp_code || "");
  const type = String(payload?.event_data?.otp_type || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) return null;

  const greeting = name ? "Bonjour " + escapeEmailHtml(name) + "," : "Bonjour,";
  let subject, title, explanation, extra = "";
  if (type === "email-verification") {
    subject = "Vérifiez votre adresse e-mail – FO Free Distribution";
    title = "Confirmez votre adresse e-mail";
    explanation = "Voici votre code pour vérifier votre adresse e-mail sur l’espace FO Free Distribution.";
    extra = "<p><strong>Important :</strong> la vérification de votre adresse e-mail ne vaut pas approbation de votre compte. Votre accès restera en attente jusqu’à validation par un administrateur FO.</p>";
  } else if (type === "forget-password" && isInitialPasswordSetup) {
    subject = "Définissez votre mot de passe – FO Free Distribution";
    title = "Définir votre mot de passe";
    explanation = "Utilisez ce code pour choisir votre mot de passe et terminer la première étape de votre inscription à l’espace FO Free Distribution.";
    extra = "<p>Votre compte restera en attente jusqu’à son approbation par un administrateur FO. La définition de votre mot de passe ne donne pas encore accès à l’espace d’administration.</p>";
  } else if (type === "forget-password") {
    subject = "Votre code de réinitialisation – FO Free Distribution";
    title = "Réinitialiser votre mot de passe";
    explanation = "Utilisez ce code pour poursuivre la réinitialisation de votre mot de passe.";
  } else if (type === "sign-in") {
    subject = "Votre code de connexion – FO Free Distribution";
    title = "Confirmez votre connexion";
    explanation = "Utilisez ce code pour confirmer votre connexion à l’espace FO Free Distribution.";
  } else {
    return null;
  }

  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#25262b;line-height:1.6"><div style="background:#c8102e;color:#fff;padding:22px 28px;font-size:20px;font-weight:bold">FO Free Distribution</div><div style="padding:28px"><p>' + greeting + '</p><h1 style="font-size:24px">' + title + '</h1><p>' + explanation + '</p><p style="margin:24px 0;padding:18px;background:#f4f4f5;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px">' + code + '</p>' + extra + '<p>Ce code est à usage unique. Ne le communiquez à personne.</p><p style="color:#666;font-size:13px">FO Free Distribution · <a href="https://fd.focom-iliad.fr">fd.focom-iliad.fr</a></p></div></div>';
  const text = greeting.replace(/<[^>]+>/g, "") + "\n\n" + title + "\n\n" + explanation + "\n\nCode : " + code + (type === "email-verification" ? "\n\nImportant : la vérification de votre adresse e-mail ne vaut pas approbation de votre compte. Votre accès restera en attente jusqu’à validation par un administrateur FO." : "") + "\n\nCe code est à usage unique. Ne le communiquez à personne.\nFO Free Distribution";
  return { email, subject, html, text };
}

async function handleNeonAuthWebhook(request, env) {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!env.BREVO_API_KEY) return json({ error: "EMAIL_PROVIDER_NOT_CONFIGURED" }, 503);
  const rawBody = await request.text();
  if (rawBody.length > 32768) return json({ error: "PAYLOAD_TOO_LARGE" }, 413);

  let payload;
  try { payload = await verifyNeonWebhook(rawBody, request.headers, env); }
  catch (error) {
    console.warn("Neon Auth webhook rejected:", error?.message || "verification failed");
    return json({ error: "INVALID_WEBHOOK_SIGNATURE" }, 401);
  }

  if (payload?.event_type !== "send.otp") return json({ success: true, ignored: true }, 200);
  const eventId = typeof payload.event_id === "string" ? payload.event_id.trim() : "";
  if (!eventId || eventId.length > 200) return json({ error: "INVALID_EVENT_ID" }, 400);
  let isInitialPasswordSetup = false;
  try {
    const accountState = await withDatabase(env, db => db.query(
      `SELECT EXISTS (
         SELECT 1
         FROM neon_auth."user" u
         JOIN public.site_user_access a ON a.user_id = u.id
         WHERE lower(u.email) = lower($1)
           AND a.status = 'pending'
           AND NOT EXISTS (
             SELECT 1 FROM neon_auth.account ac
             WHERE ac."userId" = u.id
               AND ac."providerId" = 'credential'
               AND NULLIF(ac.password, '') IS NOT NULL
           )
       ) AS initial_setup`,
      [String(payload?.user?.email || "").trim().toLowerCase()]
    ));
    isInitialPasswordSetup = accountState.rows[0]?.initial_setup === true;
  } catch (error) {
    console.error("Neon OTP account-state lookup failed:", error?.code || error?.name || "unknown");
    return json({ error: "OTP_ACCOUNT_STATE_UNAVAILABLE" }, 503);
  }
  const email = renderOtpEmail(payload, isInitialPasswordSetup);
  if (!email) return json({ error: "INVALID_OTP_EVENT" }, 400);

  let claimed = false;
  try {
    const claim = await withDatabase(env, db => db.query(
      "INSERT INTO public.neon_auth_webhook_events (event_id,event_type,status) VALUES ($1,'send.otp','processing') ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
      [eventId]
    ));
    claimed = claim.rows.length === 1;
    if (!claimed) {
      const existing = await withDatabase(env, db => db.query(
        "SELECT status FROM public.neon_auth_webhook_events WHERE event_id=$1",
        [eventId]
      ));
      if (existing.rows[0]?.status === "sent") return json({ success: true, duplicate: true }, 200);
      return json({ error: "EVENT_ALREADY_PROCESSING" }, 503);
    }
  } catch (error) {
    console.error("Neon webhook idempotency check failed:", error?.code || error?.name || "unknown");
    return json({ error: "WEBHOOK_STORAGE_UNAVAILABLE" }, 503);
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "FO Free Distribution", email: "no-reply@focom-iliad.fr" },
        replyTo: { email: "contact@focom-iliad.fr" },
        to: [{ email: email.email }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Neon OTP email delivery failed:", response.status, detail.slice(0, 300));
      await withDatabase(env, db => db.query("DELETE FROM public.neon_auth_webhook_events WHERE event_id=$1 AND status='processing'", [eventId]));
      return json({ error: "EMAIL_DELIVERY_FAILED" }, 502);
    }
    await withDatabase(env, db => db.query(
      "UPDATE public.neon_auth_webhook_events SET status='sent',sent_at=now() WHERE event_id=$1 AND status='processing'",
      [eventId]
    ));
    return json({ success: true }, 200);
  } catch (error) {
    console.error("Neon OTP email request failed:", error?.name || "unknown");
    if (claimed) {
      await withDatabase(env, db => db.query("DELETE FROM public.neon_auth_webhook_events WHERE event_id=$1 AND status='processing'", [eventId])).catch(() => {});
    }
    return json({ error: "EMAIL_PROVIDER_UNAVAILABLE" }, 502);
  }
}

function renderAccountEmail(type, name) {
  const safeName = String(name || "").trim().slice(0, 120);
  const greeting = safeName ? "Bonjour " + safeName + "," : "Bonjour,";
  const common = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#25262b;line-height:1.6"><div style="background:#c8102e;color:#fff;padding:22px 28px;font-size:20px;font-weight:bold">FO Free Distribution</div><div style="padding:28px">';
  const footer = '<p style="margin-top:28px;color:#666;font-size:13px">FO Free Distribution<br><a href="https://fd.focom-iliad.fr" style="color:#c8102e">fd.focom-iliad.fr</a></p></div></div>';
  if (type === "welcome") {
    const subject = "Bienvenue sur l’espace FO Free Distribution";
    const intro = "Votre compte a bien été créé. Il reste à vérifier votre adresse e-mail si cette étape vous est demandée, puis à attendre l’activation de votre accès par l’équipe FO.";
    const html = common + '<p>' + escapeEmailHtml(greeting) + '</p><h1 style="font-size:24px">Bienvenue !</h1><p>' + intro + '</p><p>Vous recevrez un autre message lorsque votre accès sera activé. En attendant, aucune action supplémentaire n’est nécessaire.</p>' + footer;
    const text = greeting + "\n\nBienvenue sur l’espace FO Free Distribution.\n\n" + intro + "\n\nVous recevrez un autre message lorsque votre accès sera activé.";
    return { subject, html, text };
  }
  if (type === "activation") {
    const subject = "Votre accès à l’espace FO Free Distribution est activé";
    const intro = "Un administrateur vient d’activer votre compte. Vous pouvez désormais vous connecter à votre espace FO Free Distribution.";
    const html = common + '<p>' + escapeEmailHtml(greeting) + '</p><h1 style="font-size:24px">Votre compte est activé</h1><p>' + intro + '</p><p style="margin:26px 0"><a href="https://fd.focom-iliad.fr/admin" style="display:inline-block;background:#c8102e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:5px;font-weight:bold">Accéder à mon espace</a></p>' + footer;
    const text = greeting + "\n\nVotre compte est activé.\n\n" + intro + "\n\nConnexion : https://fd.focom-iliad.fr/admin";
    return { subject, html, text };
  }
  return null;
}


async function sendAccountEmailDetailed(env, recipient, name, type) {
  const email = renderAccountEmail(type, name);
  if (!email) return { sent: false, reason: "INVALID_TEMPLATE" };
  if (!env.BREVO_API_KEY) return { sent: false, reason: "BREVO_API_KEY_MISSING" };
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "FO Free Distribution", email: "no-reply@focom-iliad.fr" },
        replyTo: { email: "contact@focom-iliad.fr" },
        to: [{ email: recipient }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
    });
    if (response.ok) return { sent: true, status: response.status };
    const detail = await response.json().catch(() => ({}));
    const message = String(detail.message || detail.code || "Brevo a refusé la demande").slice(0, 180);
    console.error("Account email delivery failed:", type, response.status, message);
    return { sent: false, status: response.status, reason: message };
  } catch (error) {
    console.error("Account email request failed:", type, error?.name || "unknown");
    return { sent: false, reason: "NETWORK_ERROR" };
  }
}

async function sendAccountEmail(env, recipient, name, type) {
  const email = renderAccountEmail(type, name);
  if (!email || !env.BREVO_API_KEY) return false;
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "FO Free Distribution", email: "no-reply@focom-iliad.fr" },
        replyTo: { email: "contact@focom-iliad.fr" },
        to: [{ email: recipient }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Account email delivery failed:", type, response.status, detail.slice(0, 240));
      return false;
    }
    return true;
  } catch (error) {
    console.error("Account email request failed:", type, error?.name || "unknown");
    return false;
  }
}

async function handleAdmin(request, env, url, origin) {
  const access = await requireSiteAccess(request, env);
  if (access.denied) return json({ error: access.denied }, 401, origin);
  const admin = access.user;
  const isAdmin = admin.role === "admin";
  const isAdminDelegate = admin.role === "admin_delegate";
  const isSuperAdmin = admin.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const canAdminister = isAdmin || isAdminDelegate;

  if(url.pathname==="/api/admin/maintenance"&&request.method==="GET"){
    if(!canAdminister)return json({error:"ADMIN_REQUIRED"},403,origin);
    const row=await env.SURVEYS_DB.prepare("SELECT enabled,starts_at,ends_at,message FROM site_maintenance WHERE id=1").first();
    return json({maintenance:row?{enabled:!!row.enabled,startsAt:row.starts_at||"",endsAt:row.ends_at||"",message:row.message||""}:{enabled:false,startsAt:"",endsAt:"",message:"Nous effectuons actuellement une maintenance programmée. Merci de revenir un peu plus tard."}},200,origin);
  }
  if(url.pathname==="/api/admin/maintenance"&&request.method==="PUT"){
    if(!canAdminister)return json({error:"ADMIN_REQUIRED"},403,origin);
    let body;try{body=await request.json()}catch{return json({error:"INVALID_JSON"},400,origin)}
    const enabled=body.enabled===true,startsAt=typeof body.startsAt==="string"?body.startsAt.trim():"",endsAt=typeof body.endsAt==="string"?body.endsAt.trim():"",message=typeof body.message==="string"?body.message.trim():"";
    const validDate=value=>!value||(!Number.isNaN(Date.parse(value))&&/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,3})?)?(?:Z|[+-]\\d{2}:?\\d{2})$/.test(value));
    if(message.length>500||!validDate(startsAt)||!validDate(endsAt)||(startsAt&&endsAt&&Date.parse(endsAt)<=Date.parse(startsAt)))return json({error:"INVALID_MAINTENANCE_SETTINGS",message:"Vérifiez le message et les dates : la fin doit être postérieure au début."},400,origin);
    await env.SURVEYS_DB.prepare("INSERT INTO site_maintenance(id,enabled,starts_at,ends_at,message,updated_at,updated_by) VALUES(1,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,starts_at=excluded.starts_at,ends_at=excluded.ends_at,message=excluded.message,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(enabled?1:0,startsAt||null,endsAt||null,message||"Nous effectuons actuellement une maintenance programmée. Merci de revenir un peu plus tard.",admin.id).run();
    return json({ok:true},200,origin);
  }
  if(url.pathname==="/api/admin/site-access-password"&&request.method==="GET"){
    if(!canAdminister)return json({error:"ADMIN_REQUIRED"},403,origin);
    const row=await configuredSitePassword(env);
    return json({configured:!!row||String(env.SITE_ACCESS_PASSWORD||"").length>=12,managedInDashboard:!!row},200,origin);
  }
  if(url.pathname==="/api/admin/site-access-password"&&request.method==="PUT"){
    if(!canAdminister)return json({error:"ADMIN_REQUIRED"},403,origin);
    let body;try{body=await request.json()}catch{return json({error:"INVALID_JSON"},400,origin)}
    const password=typeof body.password==="string"?body.password:"";
    if(password.length<12||password.length>128||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)||!/[^A-Za-z0-9]/.test(password))return json({error:"WEAK_PASSWORD",message:"Le mot de passe doit contenir au moins 12 caractères, une minuscule, une majuscule, un chiffre et un caractère spécial."},400,origin);
    const salt=crypto.getRandomValues(new Uint8Array(16)),iterations=100000,hash=await deriveSitePassword(password,salt,iterations);
    await env.SURVEYS_DB.prepare("INSERT INTO site_access_config(id,password_salt,password_hash,iterations,updated_at,updated_by) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET password_salt=excluded.password_salt,password_hash=excluded.password_hash,iterations=excluded.iterations,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(b64url(salt),b64url(hash),iterations,new Date().toISOString(),admin.id).run();
    return json({ok:true},200,origin);
  }

  if(url.pathname==="/api/admin/site-content"&&request.method==="GET"){
    const rows=await env.SURVEYS_DB.prepare("SELECT content_key,content_json,status,updated_at FROM site_content WHERE content_key IN ('claims:draft','rights:draft','section_order:draft','claims:published','rights:published','section_order:published')").all();
    const content={};for(const row of rows.results||[]){const [key,state]=row.content_key.split(":");try{content[key]||={};content[key][state]=JSON.parse(row.content_json)}catch{}}
    return json({content,permissions:{canPublish:canAdminister}},200,origin);
  }
  if(url.pathname==="/api/admin/site-content"&&request.method==="POST"){
    let body;try{body=await request.json()}catch{return json({error:"INVALID_JSON"},400,origin)}
    const key=String(body.key||"");if(!validateSiteContent(key,body.content))return json({error:"INVALID_SITE_CONTENT"},400,origin);
    if(key==="section_order"&&!canAdminister)return json({error:"ADMIN_REQUIRED"},403,origin);
    if(body.action==="publish"&&!canAdminister)return json({error:"PUBLISH_PERMISSION_REQUIRED"},403,origin);
    const encoded=JSON.stringify(body.content);if(encoded.length>60000)return json({error:"CONTENT_TOO_LARGE"},413,origin);
    const save=async(state)=>env.SURVEYS_DB.prepare("INSERT INTO site_content(content_key,content_json,status,updated_by) VALUES(?,?,?,?) ON CONFLICT(content_key) DO UPDATE SET content_json=excluded.content_json,status=excluded.status,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_by=excluded.updated_by").bind(key+":"+state,encoded,state,admin.id).run();
    if(body.action==="publish"){await save("draft");await save("published");return json({ok:true,published:true},200,origin)}
    await save("draft");return json({ok:true,draft:true},200,origin);
  }
  if(url.pathname==="/api/admin/survey-config"&&request.method==="GET"){
    if(!canAdminister)return json({error:"ADMIN_REQUIRED"},403,origin);
    const row=await env.SURVEYS_DB.prepare("SELECT config_json,draft_json,version FROM survey_configuration WHERE id=1").first();
    let published=SURVEY_CONFIG_DEFAULT,draft=null;try{if(row?.config_json)published=JSON.parse(row.config_json)}catch{}try{if(row?.draft_json)draft=JSON.parse(row.draft_json)}catch{}
    return json({published,draft,version:Number(row?.version||1)},200,origin);
  }
  if(url.pathname==="/api/admin/survey-config"&&request.method==="POST"){
    if(!canAdminister)return json({error:"ADMIN_REQUIRED"},403,origin);
    let body;try{body=await request.json()}catch{return json({error:"INVALID_JSON"},400,origin)}
    if(!validateSurveyConfig(body.config))return json({error:"INVALID_SURVEY_CONFIG"},400,origin);
    const encoded=JSON.stringify(body.config);if(encoded.length>20000)return json({error:"CONFIG_TOO_LARGE"},413,origin);
    if(body.action==="publish"){
      await env.SURVEYS_DB.prepare("INSERT INTO survey_configuration(id,config_json,draft_json,version,updated_by) VALUES(1,?,NULL,1,?) ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json,draft_json=NULL,version=survey_configuration.version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_by=excluded.updated_by").bind(encoded,admin.id).run();
      return json({ok:true,published:true},200,origin);
    }
    await env.SURVEYS_DB.prepare("INSERT INTO survey_configuration(id,config_json,draft_json,version,updated_by) VALUES(1,?,?,1,?) ON CONFLICT(id) DO UPDATE SET draft_json=excluded.draft_json,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_by=excluded.updated_by").bind(JSON.stringify(SURVEY_CONFIG_DEFAULT),encoded,admin.id).run();
    return json({ok:true,draft:true},200,origin);
  }

  if (url.pathname === "/api/admin/account-email-preview" && request.method === "GET") {
    if (!isAdmin) return json({ error: "SUPER_ADMIN_REQUIRED" }, 403, origin);
    const type = url.searchParams.get("type") || "";
    const name = url.searchParams.get("name") || "";
    const email = renderAccountEmail(type, name);
    if (!email) return json({ error: "INVALID_EMAIL_TEMPLATE" }, 400, origin);
    return json({ previewOnly: true, sender: { name: "FO Free Distribution", email: "no-reply@focom-iliad.fr" }, replyTo: { email: "contact@focom-iliad.fr" }, ...email }, 200, origin);
  }
  const isEditor = admin.role === "editor";
  const messagingAllowed = url.pathname === "/api/admin/private-messages" || /^\/api\/admin\/private-messages\/[0-9a-f-]{36}(?:\/read)?$/i.test(url.pathname);
  const editorAllowed = url.pathname === "/api/admin/articles" || url.pathname === "/api/admin/overview" || messagingAllowed || url.pathname === "/api/admin/site-content" || /^\/api\/admin\/articles\/\d+$/.test(url.pathname);
  if ((admin.role === "employee" && !messagingAllowed && url.pathname !== "/api/admin/overview") || (isEditor && !editorAllowed)) return json({ error: "INSUFFICIENT_PERMISSIONS" }, 403, origin);


  if (url.pathname === "/api/admin/users" && request.method === "POST") {
    if (!canAdminister) return json({ error: "ADMIN_REQUIRED" }, 403, origin);
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role || "employee";
    if (isAdminDelegate && (role === "admin" || role === "admin_delegate")) return json({ error: "DELEGATE_CANNOT_ASSIGN_ADMIN" }, 403, origin);
    if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !["employee", "editor", "admin", "admin_delegate"].includes(role)) {
      return json({ error: "INVALID_USER_FIELDS", message: "Vérifiez le nom, l’adresse e-mail et le rôle." }, 400, origin);
    }
    if (!env.NEON_API_KEY || !env.NEON_PROJECT_ID || !env.NEON_BRANCH_ID) return json({ error: "NEON_API_CONFIGURATION_MISSING", message: "La configuration API Neon n’est pas complète sur cet environnement." }, 503, origin);
    try {
      const neonResponse = await fetch(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(env.NEON_PROJECT_ID || "")}/branches/${encodeURIComponent(env.NEON_BRANCH_ID || "")}/auth/users`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.NEON_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const neonData = await neonResponse.json().catch(() => ({}));
      if (!neonResponse.ok) {
        const neonError = String(neonData.message || neonData.error || neonData.code || "Erreur Neon sans détail");
        const duplicate = neonResponse.status === 409 || /already exists|duplicate|user already exists/i.test(neonError);
        console.error("Neon user creation rejected:", neonResponse.status, neonError.slice(0, 240));
        return json({
          error: duplicate ? "USER_ALREADY_EXISTS" : "NEON_USER_CREATE_FAILED",
          message: duplicate ? "Un compte existe déjà pour cette adresse e-mail." : "Neon a refusé la création (" + neonResponse.status + ") : " + neonError.slice(0, 180)
        }, duplicate ? 409 : 502, origin);
      }
      if (!neonData.id) return json({ error: "NEON_INVALID_RESPONSE" }, 502, origin);
      try {
        await withDatabase(env, db => db.query(
          `INSERT INTO public.site_user_access (user_id, role, status, approved_by, approved_at, updated_at)
           VALUES ($1, $2, 'pending', $3, NULL, now())
           ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, status = 'pending',
             approved_by = EXCLUDED.approved_by, approved_at = NULL, updated_at = now()`,
          [neonData.id, role, admin.id]
        ));
      } catch (dbError) {
        console.error("Site access record creation failed after Neon user creation:", dbError?.code || dbError?.name || "unknown");
        return json({ error: "USER_CREATED_ACCESS_PENDING", message: "Le compte d’authentification a été créé, mais son accès au site n’a pas pu être initialisé. Ne relancez pas la création ; actualisez la liste et contactez l’administrateur." }, 503, origin);
      }
      const emailSent = await sendAccountEmail(env, email, name, "welcome");
      return json({ success: true, user: { id: neonData.id, name, email, role, status: "pending" }, emailSent }, 201, origin);
    } catch (error) {
      console.error("Neon user creation request failed:", error?.name || "unknown");
      return json({ error: "NEON_API_UNAVAILABLE", message: "Le service de création de compte est momentanément indisponible." }, 503, origin);
    }
  }

  const resendWelcomeMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/send-welcome$/i);
  if (resendWelcomeMatch && request.method === "POST") {
    if (!canAdminister) return json({ error: "ADMIN_REQUIRED" }, 403, origin);
    const result = await withDatabase(env, db => db.query(
      'SELECT u.email, u.name FROM neon_auth."user" u JOIN public.site_user_access a ON a.user_id=u.id WHERE u.id=$1 AND a.status=\'pending\'',
      [resendWelcomeMatch[1]]
    ));
    if (!result.rows.length) return json({ error: "PENDING_USER_NOT_FOUND" }, 404, origin);
    const delivery = await sendAccountEmailDetailed(env, result.rows[0].email, result.rows[0].name, "welcome");
    return json({ success: delivery.sent, emailSent: delivery.sent, diagnostic: delivery }, delivery.sent ? 200 : 502, origin);
  }

  const deleteUserMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/i);
  if (deleteUserMatch && request.method === "DELETE") {
    if (!canAdminister) return json({ error: "ADMIN_REQUIRED" }, 403, origin);
    const targetId = deleteUserMatch[1];
    if (targetId === admin.id) return json({ error: "CANNOT_DELETE_SELF", message: "Vous ne pouvez pas supprimer votre propre compte." }, 403, origin);
    const target = await withDatabase(env, db => db.query(
      `SELECT u.id, u.email, COALESCE(a.role, CASE WHEN lower(u.email) IN (lower($2), lower($3)) THEN 'admin' ELSE 'employee' END) AS role FROM neon_auth."user" u LEFT JOIN public.site_user_access a ON a.user_id=u.id WHERE u.id=$1 LIMIT 1`, [targetId, ADMIN_EMAIL, LEGACY_ADMIN_EMAIL]
    ));
    if (!target.rows.length) return json({ error: "USER_NOT_FOUND" }, 404, origin);
    if (isAdminDelegate && (isProtectedAdminEmail(target.rows[0].email) || ["admin", "admin_delegate"].includes(target.rows[0].role))) return json({ error: "PRIVILEGED_ACCOUNT_PROTECTED" }, 403, origin);
    if (isProtectedAdminEmail(target.rows[0].email)) {
      return json({ error: "PROTECTED_ACCOUNT", message: "Le compte administrateur principal est protégé." }, 403, origin);
    }
    if (!env.NEON_API_KEY || !env.NEON_PROJECT_ID || !env.NEON_BRANCH_ID) return json({ error: "NEON_API_CONFIGURATION_MISSING" }, 503, origin);
    const neonResponse = await fetch(
      `https://console.neon.tech/api/v2/projects/${encodeURIComponent(env.NEON_PROJECT_ID || "")}/branches/${encodeURIComponent(env.NEON_BRANCH_ID || "")}/auth/users/` + encodeURIComponent(targetId),
      { method: "DELETE", headers: { "Authorization": "Bearer " + env.NEON_API_KEY, "Accept": "application/json" } }
    );
    if (!neonResponse.ok && neonResponse.status !== 404) {
      const detail = await neonResponse.text();
      console.error("Neon user deletion failed:", neonResponse.status, detail.slice(0, 180));
      return json({ error: "NEON_USER_DELETE_FAILED", message: "Neon a refusé la suppression du compte (" + neonResponse.status + ")." }, 502, origin);
    }
    try {
      await withDatabase(env, db => db.query("DELETE FROM public.site_user_access WHERE user_id=$1", [targetId]));
    } catch (error) {
      console.error("User access cleanup failed:", error?.code || error?.name || "unknown");
      return json({ success: true, accessCleanupPending: true, message: "Le compte Neon est supprimé, mais le nettoyage de son autorisation nécessite une vérification." }, 200, origin);
    }
    return json({ success: true, deletedEmail: target.rows[0].email }, 200, origin);
  }

  if (url.pathname === "/api/admin/users" && request.method === "GET") {
    const r = await withDatabase(env, db => db.query(
      `SELECT u.id, u.name, u.email, u."emailVerified" AS email_verified, u."createdAt" AS created_at,
              COALESCE(a.role, CASE WHEN lower(u.email) IN (lower($1), lower($2)) THEN 'admin' ELSE 'employee' END) AS role,
              COALESCE(a.status, CASE WHEN lower(u.email) IN (lower($1), lower($2)) THEN 'active' ELSE 'pending' END) AS status
       FROM neon_auth."user" u LEFT JOIN public.site_user_access a ON a.user_id = u.id
       WHERE ($3::boolean OR lower(u.email) NOT IN (lower($1), lower($2)))
       ORDER BY u."createdAt" DESC LIMIT 500`, [ADMIN_EMAIL, LEGACY_ADMIN_EMAIL, !isAdminDelegate]
    ));
    return json({ users: r.rows, canAssignDelegate: isSuperAdmin }, 200, origin);
  }
  const userId = url.pathname.startsWith("/api/admin/users/") ? url.pathname.slice("/api/admin/users/".length) : "";
  if (/^[0-9a-f-]{36}$/i.test(userId) && request.method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    const role = body.role, status = body.status;
    const name = body.name === undefined ? null : (typeof body.name === "string" ? body.name.trim() : "");
    if (!["admin", "admin_delegate", "editor", "employee"].includes(role) || !["pending", "active", "suspended"].includes(status)) return json({ error: "INVALID_ROLE_OR_STATUS" }, 400, origin);
    if (name !== null && (!name || name.length > 120)) return json({ error: "INVALID_USER_NAME", message: "Le nom doit contenir entre 1 et 120 caractères." }, 400, origin);
    const result = await withDatabase(env, async db => {
      const target = await db.query(
        `SELECT u.id, u.email, u.name, COALESCE(a.status, 'pending') AS previous_status,
                COALESCE(a.role, CASE WHEN lower(u.email) IN (lower($2), lower($3)) THEN 'admin' ELSE 'employee' END) AS previous_role
         FROM neon_auth."user" u LEFT JOIN public.site_user_access a ON a.user_id = u.id
         WHERE u.id = $1`, [userId, ADMIN_EMAIL, LEGACY_ADMIN_EMAIL]
      );
      if (!target.rows[0]) return { missing: true };
      if (isProtectedAdminEmail(target.rows[0].email) && ((role !== "admin" || status !== "active") || name !== null)) return { protected: true };
      if (isAdminDelegate && (role === "admin" || role === "admin_delegate" || target.rows[0].previous_role === "admin" || target.rows[0].previous_role === "admin_delegate")) return { forbiddenTarget: true };
      if (userId === admin.id && (role !== "admin" || status !== "active")) return { selfProtected: true };
      await db.query(
        `INSERT INTO public.site_user_access (user_id, role, status, approved_by, approved_at, updated_at)
         VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'active' THEN now() ELSE NULL END, now())
         ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status,
           approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at, updated_at = now()`,
        [userId, role, status, admin.id]
      );
      if (name !== null) {
        await db.query('UPDATE neon_auth."user" SET name = $1 WHERE id = $2', [name, userId]);
      }
      return { updated: true, email: target.rows[0].email, name: name ?? target.rows[0].name, activated: target.rows[0].previous_status !== "active" && status === "active" };
    });
    if (result.missing) return json({ error: "USER_NOT_FOUND" }, 404, origin);
    if (result.protected) return json({ error: "SUPER_ADMIN_PROTECTED" }, 403, origin);
    if (result.forbiddenTarget) return json({ error: "DELEGATE_CANNOT_ASSIGN_ADMIN" }, 403, origin);
    if (result.selfProtected) return json({ error: "CANNOT_CHANGE_OWN_ADMIN_ACCESS", message: "Un administrateur ne peut pas rétrograder ou suspendre son propre compte." }, 403, origin);
    const activationEmailSent = result.activated ? await sendAccountEmail(env, result.email, result.name, "activation") : null;
    return json({ success: true, activationEmailSent }, 200, origin);
  }

  if (url.pathname === "/api/admin/newsletter/brevo-status" && request.method === "GET") {
    // Read-only authentication check. Never sends email and never exposes the API key.
    if (!env.BREVO_API_KEY) return json({ configured: false, valid: false }, 200, origin);
    try {
      const response = await fetch("https://api.brevo.com/v3/account", {
        method: "GET",
        headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY },
      });
      return json({ configured: true, valid: response.ok }, 200, origin);
    } catch {
      return json({ configured: true, valid: false }, 200, origin);
    }
  }

  if (url.pathname === "/api/admin/newsletter/subscribers" && request.method === "GET") {
    const r=await withDatabase(env,db=>db.query("SELECT id,email,status,subscribed_at FROM public.newsletter_subscribers ORDER BY subscribed_at DESC LIMIT 2000"));
    return json({subscribers:r.rows},200,origin);
  }
  if (url.pathname === "/api/admin/newsletter/subscribers" && request.method === "POST") {
    let b;try{b=await request.json()}catch{return json({error:"INVALID_JSON"},400,origin)}
    const email=String(b.email||"").trim().toLowerCase();
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"INVALID_EMAIL"},400,origin);
    if(b.consent_confirmed!==true)return json({error:"EXPLICIT_CONSENT_REQUIRED",message:"Confirmez que cette personne a explicitement accepté de recevoir la newsletter."},400,origin);
    const r=await withDatabase(env,db=>db.query("INSERT INTO public.newsletter_subscribers AS existing(email,status,subscribed_at,unsubscribed_at,consent_at,consent_source,consent_version) VALUES($1,'subscribed',NOW(),NULL,NOW(),'admin_manual','newsletter-consent-v1') ON CONFLICT(email) DO UPDATE SET status='subscribed',subscribed_at=NOW(),unsubscribed_at=NULL,consent_at=NOW(),consent_source='admin_manual',consent_version='newsletter-consent-v1' WHERE existing.status='subscribed' OR $2::boolean RETURNING id,email,status,subscribed_at",[email,b.consent_confirmed]));
    if(!r.rows[0])return json({error:"RECONSENT_REQUIRED",message:"Cette adresse est désinscrite. Une nouvelle confirmation explicite de consentement est nécessaire avant sa réinscription."},409,origin);
    return json({subscriber:r.rows[0]},200,origin);
  }
  const subMatch=url.pathname.match(/^\/api\/admin\/newsletter\/subscribers\/(.+)$/);
  if(subMatch&&request.method==="DELETE"){
    const email=decodeURIComponent(subMatch[1]).toLowerCase();
    const r=await withDatabase(env,db=>db.query("UPDATE public.newsletter_subscribers SET status='unsubscribed',unsubscribed_at=NOW() WHERE email=$1 RETURNING email",[email]));
    return r.rowCount?json({ok:true},200,origin):json({error:"SUBSCRIBER_NOT_FOUND"},404,origin);
  }
  if(url.pathname==="/api/admin/newsletter/campaigns"&&request.method==="GET"){
    const r=await withDatabase(env,db=>db.query("SELECT c.id,c.subject,c.preview_text,c.html_content,c.status,c.recipient_count,c.sent_count,c.failed_count,c.created_at,c.updated_at,c.sent_at,(SELECT COUNT(*)::int FROM public.newsletter_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='unknown') AS unknown_count,(SELECT COUNT(*)::int FROM public.newsletter_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='pending') AS pending_count,(SELECT COUNT(*)::int FROM public.newsletter_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='failed') AS failed_recipient_count,(SELECT COUNT(*)::int FROM public.newsletter_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='skipped') AS skipped_count FROM public.newsletter_campaigns c ORDER BY c.updated_at DESC LIMIT 200"));
    return json({campaigns:r.rows},200,origin);
  }
  if(url.pathname==="/api/admin/newsletter/campaigns"&&request.method==="POST"){
    let b;try{b=await request.json()}catch{return json({error:"INVALID_JSON"},400,origin)}
    const subject=String(b.subject||"").trim(),preview=String(b.preview_text||"").trim(),html=String(b.html_content||"").trim(),id=b.id?Number(b.id):null;
    if(!subject||subject.length>180||preview.length>240||!html||html.length>100000||(id&&(!Number.isSafeInteger(id)||id<1)))return json({error:"INVALID_CAMPAIGN_FIELDS"},400,origin);
    const r=await withDatabase(env,async db=>id?(await db.query("UPDATE public.newsletter_campaigns SET subject=$1,preview_text=$2,html_content=$3,updated_at=NOW() WHERE id=$4 AND status='draft' RETURNING id,subject,preview_text,html_content,status,recipient_count,sent_count,failed_count,created_at,updated_at,sent_at",[subject,preview,html,id])).rows[0]||null:(await db.query("INSERT INTO public.newsletter_campaigns(subject,preview_text,html_content) VALUES($1,$2,$3) RETURNING id,subject,preview_text,html_content,status,recipient_count,sent_count,failed_count,created_at,updated_at,sent_at",[subject,preview,html])).rows[0]);
    return r?json({campaign:r},200,origin):json({error:"CAMPAIGN_NOT_EDITABLE"},409,origin);
  }
  const testSendMatch=url.pathname.match(/^\/api\/admin\/newsletter\/campaigns\/(\d+)\/test-send$/);
  if(testSendMatch&&request.method==="POST"){
    if(url.hostname!=="fd-preview.linux92fr.workers.dev")return json({error:"TEST_SEND_PREVIEW_ONLY"},404,origin);
    const id=Number(testSendMatch[1]);
    const campaign=await withDatabase(env,async db=>(await db.query("SELECT id FROM public.newsletter_campaigns WHERE id=$1",[id])).rows[0]||null);
    if(!campaign)return json({error:"CAMPAIGN_NOT_FOUND"},404,origin);
    return json({ok:true,simulated:true,message:"Test simulé en préproduction : aucun e-mail n’a été envoyé."},200,origin);
  }

  const sendMatch=url.pathname.match(/^\/api\/admin\/newsletter\/campaigns\/(\d+)\/send$/);
  if(sendMatch&&request.method==="POST"){
    const newsletterSimulator=env.NEWSLETTER_SIMULATOR==="true"&&new URL(request.url).hostname==="fd-preview.linux92fr.workers.dev";
    if(!env.BREVO_API_KEY&&!newsletterSimulator)return json({error:"BREVO_NOT_CONFIGURED"},503,origin);
    const id=Number(sendMatch[1]);
    let body={};try{body=await request.json()}catch{return json({error:"INVALID_JSON"},400,origin)}
    const action=body.action||"start";
    if(!["start","resume","retry_failed"].includes(action))return json({error:"INVALID_ACTION"},400,origin);
    const outcome=await withAdvisoryLock(env,"newsletter-campaign:"+id,async()=>{
      const prepared=await withDatabase(env,async db=>{
        const campaign=(await db.query("SELECT id,status FROM public.newsletter_campaigns WHERE id=$1",[id])).rows[0];
        if(!campaign)return {error:"CAMPAIGN_NOT_FOUND"};
        if(action==="start"){
          if(campaign.status!=="draft")return {error:"CAMPAIGN_NOT_STARTABLE"};
          await db.query("INSERT INTO public.newsletter_campaign_recipients(campaign_id,subscriber_id,email) SELECT $1,id,email FROM public.newsletter_subscribers WHERE status='subscribed' ON CONFLICT(campaign_id,subscriber_id) DO NOTHING",[id]);
        } else {
          if(!["sending","partial"].includes(campaign.status))return {error:"CAMPAIGN_NOT_RESUMABLE"};
          const active=await db.query("SELECT COUNT(*)::int AS n FROM public.newsletter_campaign_recipients WHERE campaign_id=$1 AND status='sending' AND updated_at>NOW()-INTERVAL '5 minutes'",[id]);
          if(active.rows[0].n)return {error:"DELIVERY_STILL_RUNNING"};
          await db.query("UPDATE public.newsletter_campaign_recipients SET status='unknown',last_error='Interruption pendant la tentative : résultat Brevo indéterminé',updated_at=NOW() WHERE campaign_id=$1 AND status='sending' AND updated_at<=NOW()-INTERVAL '5 minutes'",[id]);
          if(action==="retry_failed")await db.query("UPDATE public.newsletter_campaign_recipients r SET status='pending',last_error=NULL,updated_at=NOW() FROM public.newsletter_subscribers s WHERE r.campaign_id=$1 AND r.status='failed' AND s.id=r.subscriber_id AND s.status='subscribed'",[id]);
        }
        // A pending recipient who unsubscribed after the campaign snapshot is terminally skipped.
        await db.query("UPDATE public.newsletter_campaign_recipients r SET status='skipped',last_error='Désinscription avant envoi',updated_at=NOW() FROM public.newsletter_subscribers s WHERE r.campaign_id=$1 AND r.status='pending' AND s.id=r.subscriber_id AND s.status<>'subscribed'",[id]);
        const counts=await db.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='sent')::int AS sent,COUNT(*) FILTER(WHERE status='failed')::int AS failed,COUNT(*) FILTER(WHERE status='unknown')::int AS unknown,COUNT(*) FILTER(WHERE status='pending')::int AS pending,COUNT(*) FILTER(WHERE status='skipped')::int AS skipped FROM public.newsletter_campaign_recipients WHERE campaign_id=$1",[id]);
        if(!counts.rows[0].total)return {error:"NO_ACTIVE_SUBSCRIBERS"};
        if(counts.rows[0].total>500)return {error:"TOO_MANY_SUBSCRIBERS_FOR_SINGLE_SEND"};
        await db.query("UPDATE public.newsletter_campaigns SET status='sending',recipient_count=$1,sent_count=$2,failed_count=$3,updated_at=NOW() WHERE id=$4",[counts.rows[0].total,counts.rows[0].sent,counts.rows[0].failed,id]);
        return {counts:counts.rows[0]};
      });
      if(prepared.error)return {error:prepared.error};
      let processed=0;
      while(processed<10){
        const item=await withDatabase(env,async db=>{
          const r=await db.query("UPDATE public.newsletter_campaign_recipients cr SET status='sending',attempts=attempts+1,updated_at=NOW(),last_error=NULL WHERE cr.id=(SELECT cr2.id FROM public.newsletter_campaign_recipients cr2 JOIN public.newsletter_subscribers s ON s.id=cr2.subscriber_id AND s.status='subscribed' WHERE cr2.campaign_id=$1 AND cr2.status='pending' ORDER BY cr2.id LIMIT 1 FOR UPDATE OF cr2 SKIP LOCKED) RETURNING cr.id,cr.email",[id]);
          return r.rows[0]||null;
        });
        if(!item)break;
        processed++;
        const sub=await withDatabase(env,db=>db.query("SELECT unsubscribe_token FROM public.newsletter_subscribers WHERE email=$1 AND status='subscribed'",[item.email]));
        const token=sub.rows[0]?.unsubscribe_token;
        if(!token){
          await withDatabase(env,db=>db.query("UPDATE public.newsletter_campaign_recipients SET status='skipped',last_error='Désinscription avant envoi',updated_at=NOW() WHERE id=$1",[item.id]));
          continue;
        }
        const unsubscribeUrl=new URL("/newsletter/desinscription",url.origin);unsubscribeUrl.searchParams.set("token",token);const u=unsubscribeUrl.toString();
        const c=await withDatabase(env,db=>db.query("SELECT subject,preview_text,html_content FROM public.newsletter_campaigns WHERE id=$1",[id]));
        const campaign=c.rows[0];
        const html=(campaign.preview_text?'<div style="display:none;max-height:0;overflow:hidden;opacity:0">'+campaign.preview_text.replace(/[&<>]/g," ")+'</div>':"")+campaign.html_content+'<hr><p style="font:12px Arial;color:#666">Vous recevez cette newsletter FO Free Distribution. <a href="'+u+'">Se désinscrire</a>.</p>';
        try{
          let response;
          if(newsletterSimulator){
            response={ok:item.email==="test-desinscription@example.com",status:item.email==="test-desinscription@example.com"?201:400};
          } else {
            response=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"accept":"application/json","api-key":env.BREVO_API_KEY,"content-type":"application/json"},body:JSON.stringify({sender:{name:"FO Free Distribution",email:"newsletter@focom-iliad.fr"},to:[{email:item.email}],subject:campaign.subject,htmlContent:html,textContent:html.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()+"\n\nSe désinscrire : "+u,headers:{"List-Unsubscribe":"<"+u+">","List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}})});
          }
          if(response.ok)await withDatabase(env,db=>db.query("UPDATE public.newsletter_campaign_recipients SET status='sent',sent_at=NOW(),updated_at=NOW() WHERE id=$1",[item.id]));
          else if(response.status>=500)await withDatabase(env,db=>db.query("UPDATE public.newsletter_campaign_recipients SET status='unknown',last_error=$2,updated_at=NOW() WHERE id=$1",[item.id,"Réponse Brevo HTTP "+response.status]));
          else await withDatabase(env,db=>db.query("UPDATE public.newsletter_campaign_recipients SET status='failed',last_error=$2,updated_at=NOW() WHERE id=$1",[item.id,newsletterSimulator?"Échec simulé (aucun email envoyé)":"Réponse Brevo HTTP "+response.status]));
        }catch(e){
          await withDatabase(env,db=>db.query("UPDATE public.newsletter_campaign_recipients SET status='unknown',last_error='Erreur réseau : résultat Brevo indéterminé',updated_at=NOW() WHERE id=$1",[item.id]));
        }
      }
      const final=await withDatabase(env,async db=>{
        await db.query("UPDATE public.newsletter_campaign_recipients r SET status='skipped',last_error='Désinscription avant envoi',updated_at=NOW() FROM public.newsletter_subscribers s WHERE r.campaign_id=$1 AND r.status='pending' AND s.id=r.subscriber_id AND s.status<>'subscribed'",[id]);
        const r=await db.query("SELECT COUNT(*) FILTER(WHERE status='sent')::int AS sent,COUNT(*) FILTER(WHERE status='failed')::int AS failed,COUNT(*) FILTER(WHERE status='unknown')::int AS unknown,COUNT(*) FILTER(WHERE status='skipped')::int AS skipped,COUNT(*) FILTER(WHERE status IN ('pending','sending'))::int AS remaining FROM public.newsletter_campaign_recipients WHERE campaign_id=$1",[id]);
        const x=r.rows[0],status=x.remaining?"sending":(x.failed||x.unknown)?"partial":"sent";
        await db.query("UPDATE public.newsletter_campaigns SET status=$1,sent_count=$2,failed_count=$3,sent_at=CASE WHEN $4 THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$5",[status,x.sent,x.failed,(status==="sent"||status==="partial"),id]);
        return {...x,status};
      });
      return {ok:true,...final};
    });
    if(outcome.lockUnavailable)return json({error:"DELIVERY_STILL_RUNNING",message:"Un traitement de cette campagne est déjà en cours. Réessayez dans quelques instants."},409,origin);
    if(outcome.error){
      if(outcome.error==="NO_ACTIVE_SUBSCRIBERS")return json({error:outcome.error},409,origin);
      if(outcome.error==="TOO_MANY_SUBSCRIBERS_FOR_SINGLE_SEND")return json({error:outcome.error,limit:500},413,origin);
      return json({error:outcome.error},409,origin);
    }
    return json(outcome,200,origin);
  }

  if (url.pathname === "/api/admin/homepage" && request.method === "GET") {
    const result = await withDatabase(env, db => db.query("SELECT content FROM public.homepage_content WHERE id=1"));
    return json({ content: { ...HOMEPAGE_DEFAULTS, ...(result.rows[0]?.content || {}) } }, 200, origin);
  }
  if (url.pathname === "/api/admin/homepage" && request.method === "PUT") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    if (!body || typeof body.content !== "object" || Array.isArray(body.content)) return json({ error: "INVALID_CONTENT" }, 400, origin);
    const content = {};
    for (const [key, fallback] of Object.entries(HOMEPAGE_DEFAULTS)) {
      const value = body.content[key] === undefined ? fallback : String(body.content[key]);
      if (value.length > 2000) return json({ error: "FIELD_TOO_LONG", field: key }, 400, origin);
      if (key.endsWith("_image") && value && !/^\/media\/uploads\/[a-zA-Z0-9._/-]+$/.test(value)) return json({ error: "INVALID_IMAGE", field: key }, 400, origin);
      if ((key === "hero_primary_url" || key === "hero_secondary_url") && !(/^(https:\/\/|\/[a-z0-9#?/_-]*|#[a-z0-9_-]+)$/i.test(value))) return json({ error: "INVALID_LINK", field: key }, 400, origin);
      content[key] = value;
    }
    await withDatabase(env, db => db.query(
      "INSERT INTO public.homepage_content (id, content, updated_at) VALUES (1, $1::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET content=EXCLUDED.content, updated_at=NOW()",
      [JSON.stringify(content)]
    ));
    return json({ ok: true, content }, 200, origin);
  }

  if (url.pathname === "/api/admin/media" && request.method === "GET") {
    if (!env.MEDIA) return json({ error: "MEDIA_STORAGE_UNAVAILABLE" }, 503, origin);
    const listed = await env.MEDIA.list({ prefix: "uploads/", limit: 200 });
    const media = listed.objects.map(object => ({
      key: object.key, size: object.size, uploaded: object.uploaded,
      url: "/media/" + object.key.split("/").map(encodeURIComponent).join("/")
    }));
    return json({ media, truncated: listed.truncated }, 200, origin);
  }

  if (url.pathname === "/api/admin/media" && request.method === "POST") {
    if (!env.MEDIA) return json({ error: "MEDIA_STORAGE_UNAVAILABLE" }, 503, origin);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 9 * 1024 * 1024) return json({ error: "FILE_TOO_LARGE" }, 413, origin);
    let form;
    try { form = await request.formData(); } catch { return json({ error: "INVALID_UPLOAD" }, 400, origin); }
    const file = form.get("file");
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!(file instanceof File) || !allowed.has(file.type)) return json({ error: "INVALID_IMAGE_TYPE" }, 415, origin);
    if (file.size < 1 || file.size > 8 * 1024 * 1024) return json({ error: "FILE_TOO_LARGE" }, 413, origin);
    const ext = ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif" })[file.type];
    const key = "uploads/" + new Date().toISOString().slice(0,10) + "/" + crypto.randomUUID() + "." + ext;
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { originalName: String(file.name || "image").slice(0,200) } });
    return json({ ok: true, key, url: "/media/" + key.split("/").map(encodeURIComponent).join("/") }, 201, origin);
  }

  const mediaDeleteMatch = url.pathname.match(/^\/api\/admin\/media\/(.+)$/);
  if (mediaDeleteMatch && request.method === "DELETE") {
    const key = decodeURIComponent(mediaDeleteMatch[1]);
    if (!key.startsWith("uploads/") || key.includes("..")) return json({ error: "INVALID_MEDIA_KEY" }, 400, origin);
    await env.MEDIA.delete(key);
    return json({ ok: true }, 200, origin);
  }

  if (url.pathname === "/api/admin/secure-survey-results" && request.method === "GET") {
    if (!env.SURVEYS_DB) return json({ error: "SURVEY_STORAGE_UNAVAILABLE" }, 503, origin);
    const result = await env.SURVEYS_DB.prepare("SELECT created_at, answers_json FROM survey_responses ORDER BY created_at DESC").all();
    const responses = (result.results || []).map(row => {
      let answers = {};
      try { answers = JSON.parse(row.answers_json); } catch {}
      return { created_at: row.created_at, answers };
    });
    return json({ responses }, 200, origin);
  }

  // Private internal messaging: every endpoint is scoped to the authenticated active account.
  if (url.pathname === "/api/admin/private-messages" && request.method === "GET") {
    const withId = url.searchParams.get("with") || "";
    const summaryOnly = url.searchParams.get("summary") === "1";
    const result = await withDatabase(env, async db => {
      const unread = await db.query(
        "SELECT COUNT(*)::int AS count FROM public.private_messages WHERE recipient_id=$1 AND read_at IS NULL",
        [admin.id]
      );
      if (summaryOnly) return { unreadCount: unread.rows[0].count, user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role }, contacts: [], messages: [] };
      const contacts = await db.query(
        `SELECT u.id, u.name, u.email,
                CASE WHEN lower(u.email) IN (lower($2), lower($3)) THEN 'admin' ELSE COALESCE(a.role,'employee') END AS role
         FROM neon_auth."user" u
         LEFT JOIN public.site_user_access a ON a.user_id=u.id
         WHERE u."emailVerified"=TRUE
           AND (lower(u.email) IN (lower($2), lower($3)) OR a.status='active')
           AND u.id<>$1
         ORDER BY lower(COALESCE(NULLIF(u.name,''),u.email))`,
        [admin.id, ADMIN_EMAIL, LEGACY_ADMIN_EMAIL]
      );
      let messages = [];
      if (withId) {
        if (!/^[0-9a-f-]{36}$/i.test(withId)) throw new Error("INVALID_RECIPIENT");
        const thread = await db.query(
          `SELECT id, sender_id, recipient_id, body, created_at, read_at
           FROM public.private_messages
           WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)
           ORDER BY created_at ASC LIMIT 300`,
          [admin.id, withId]
        );
        messages = thread.rows;
      }
      return { unreadCount: unread.rows[0].count, contacts: contacts.rows, messages };
    });
    return json(result, 200, origin);
  }

  if (url.pathname === "/api/admin/private-messages" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    const recipientId = String(body.recipient_id || "");
    const messageBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(recipientId) || recipientId === admin.id ||
        !messageBody || messageBody.length > 5000) {
      return json({ error: "INVALID_MESSAGE_FIELDS" }, 400, origin);
    }
    const sent = await withDatabase(env, async db => {
      const recipient = await db.query(
        `SELECT u.id FROM neon_auth."user" u
         LEFT JOIN public.site_user_access a ON a.user_id=u.id
         WHERE u.id=$1 AND u."emailVerified"=TRUE
           AND (lower(u.email) IN (lower($2), lower($3)) OR a.status='active') LIMIT 1`,
        [recipientId, ADMIN_EMAIL, LEGACY_ADMIN_EMAIL]
      );
      if (!recipient.rows.length) return null;
      const inserted = await db.query(
        "INSERT INTO public.private_messages (sender_id,recipient_id,body) VALUES ($1,$2,$3) RETURNING id, sender_id, recipient_id, body, created_at, read_at",
        [admin.id, recipientId, messageBody]
      );
      return inserted.rows[0];
    });
    if (!sent) return json({ error: "RECIPIENT_NOT_AVAILABLE" }, 404, origin);
    return json({ message: sent }, 201, origin);
  }

  const privateDeleteMatch = url.pathname.match(/^\/api\/admin\/private-messages\/([0-9a-f-]{36})$/i);
  if (privateDeleteMatch && request.method === "DELETE") {
    if (!canAdminister) return json({ error: "ADMIN_REQUIRED" }, 403, origin);
    const result = await withDatabase(env, db => db.query(
      "DELETE FROM public.private_messages WHERE id=$1::uuid RETURNING id",
      [privateDeleteMatch[1]]
    ));
    return result.rowCount
      ? json({ ok: true, deletedId: result.rows[0].id }, 200, origin)
      : json({ error: "MESSAGE_NOT_FOUND" }, 404, origin);
  }

  const privateReadMatch = url.pathname.match(/^\/api\/admin\/private-messages\/([0-9a-f-]{36})\/read$/i);
  if (privateReadMatch && request.method === "POST") {
    const result = await withDatabase(env, db => db.query(
      "UPDATE public.private_messages SET read_at=NOW() WHERE id=$1::uuid AND recipient_id=$2 AND read_at IS NULL RETURNING id, read_at",
      [privateReadMatch[1], admin.id]
    ));
    return json({ updated: result.rowCount, message: result.rows[0] || null }, 200, origin);
  }

  if (url.pathname === "/api/admin/overview" && request.method === "GET") {
    const result = await withDatabase(env, db => db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM public.articles) AS articles_total,
        (SELECT COUNT(*)::int FROM public.articles WHERE status='published') AS articles_published,
        (SELECT COUNT(*)::int FROM public.articles WHERE status='draft') AS articles_draft,
        CASE WHEN $1::boolean THEN (SELECT COUNT(*)::int FROM public.contact_messages) ELSE 0 END AS messages_total,
        CASE WHEN $1::boolean THEN (SELECT COUNT(*)::int FROM public.contact_messages WHERE status='new') ELSE 0 END AS messages_new,
        CASE WHEN $1::boolean THEN (SELECT COUNT(*)::int FROM public.contact_messages WHERE status='in_progress') ELSE 0 END AS messages_in_progress,
        CASE WHEN $1::boolean THEN (SELECT COUNT(*)::int FROM public.contact_messages WHERE status='resolved') ELSE 0 END AS messages_resolved`,
      [admin.role === "admin" || admin.role === "admin_delegate"]
    ));
    return json({ overview: result.rows[0], user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } }, 200, origin);
  }

  if (url.pathname === "/api/admin/messages" && request.method === "GET") {
    const result = await withDatabase(env, db => db.query(
      "SELECT id, name, email, subject, message, status, received_at, updated_at, processed_at FROM public.contact_messages ORDER BY received_at DESC LIMIT 100"
    ));
    return json({ messages: result.rows, permissions: { canDelete: admin.email.toLowerCase() === ADMIN_EMAIL } }, 200, origin);
  }

  const messageMatch = url.pathname.match(/^\/api\/admin\/messages\/(\d+)$/);
  if (messageMatch && request.method === "DELETE") {
    if (!isAdmin || admin.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return json({ error: "SUPER_ADMIN_REQUIRED" }, 403, origin);
    const result = await withDatabase(env, db => db.query(
      "DELETE FROM public.contact_messages WHERE id=$1::bigint RETURNING id",
      [Number(messageMatch[1])]
    ));
    return result.rowCount ? json({ ok: true, deletedId: result.rows[0].id }, 200, origin) : json({ error: "MESSAGE_NOT_FOUND" }, 404, origin);
  }
  if (messageMatch && request.method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    const status = String(body.status || "");
    if (!["new", "in_progress", "resolved", "archived"].includes(status)) {
      return json({ error: "INVALID_STATUS" }, 400, origin);
    }
    const result = await withDatabase(env, db => db.query(
      "UPDATE public.contact_messages SET status=$1::varchar, updated_at=NOW(), processed_at=CASE WHEN $1::varchar IN ('resolved','archived') THEN COALESCE(processed_at, NOW()) ELSE NULL END WHERE id=$2::bigint RETURNING id, status, updated_at, processed_at",
      [status, Number(messageMatch[1])]
    ));
    return result.rowCount ? json({ message: result.rows[0] }, 200, origin) : json({ error: "MESSAGE_NOT_FOUND" }, 404, origin);
  }

  if (url.pathname === "/api/admin/articles" && request.method === "GET") {
    const result = await withDatabase(env, (db) => db.query(
      "SELECT id, title, slug, excerpt, content, cover_image_url, category, status, published_at, created_at, updated_at FROM articles ORDER BY updated_at DESC LIMIT 100"
    ));
    return json({ articles: result.rows }, 200, origin);
  }

  if (url.pathname === "/api/admin/articles" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400, origin); }
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    const excerpt = String(body.excerpt || "").trim();
    const category = String(body.category || "Actualités").trim();
    const status = body.status === "published" ? "published" : "draft";
    const cover = String(body.cover_image_url || "").trim();
    const id = body.id ? Number(body.id) : null;
    if (!title || title.length > 180 || content.length > 100000 || excerpt.length > 320 || category.length > 80 || cover.length > 2000) {
      return json({ error: "INVALID_FIELDS" }, 400, origin);
    }
    if (cover && !/^https:\/\//i.test(cover)) return json({ error: "INVALID_IMAGE_URL" }, 400, origin);
    const baseSlug = slugify(body.slug || title);
    if (!baseSlug) return json({ error: "INVALID_SLUG" }, 400, origin);

    const result = await withDatabase(env, async (db) => {
      const slug = id
        ? baseSlug
        : (await db.query("SELECT CASE WHEN EXISTS (SELECT 1 FROM articles WHERE slug = $1) THEN $1 || '-' || floor(extract(epoch from now()))::text ELSE $1 END AS slug", [baseSlug])).rows[0].slug;
      if (id) {
        const updated = await db.query(
          `UPDATE articles SET title=$1, slug=$2, excerpt=$3, content=$4, cover_image_url=$5, category=$6,
             status=$7::varchar, published_at=CASE WHEN $7::varchar='published' THEN COALESCE(published_at, NOW()) ELSE NULL END,
             updated_at=NOW() WHERE id=$8
           RETURNING id, title, slug, status, published_at`,
          [title, slug, excerpt || null, content, cover || null, category, status, id]
        );
        return updated.rows[0] || null;
      }
      const inserted = await db.query(
        `INSERT INTO articles (title, slug, excerpt, content, cover_image_url, category, status, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::varchar,CASE WHEN $7::varchar='published' THEN NOW() ELSE NULL END)
         RETURNING id, title, slug, status, published_at`,
        [title, slug, excerpt || null, content, cover || null, category, status]
      );
      return inserted.rows[0];
    });
    if (!result) return json({ error: "ARTICLE_NOT_FOUND" }, 404, origin);
    return json({ article: result }, 200, origin);
  }

  const deleteMatch = url.pathname.match(/^\/api\/admin\/articles\/(\d+)$/);
  if (deleteMatch && request.method === "DELETE") {
    const result = await withDatabase(env, (db) => db.query(
      "UPDATE articles SET status='archived', published_at=NULL, updated_at=NOW() WHERE id=$1 RETURNING id",
      [Number(deleteMatch[1])]
    ));
    return result.rowCount ? json({ ok: true }, 200, origin) : json({ error: "ARTICLE_NOT_FOUND" }, 404, origin);
  }
  return json({ error: "NOT_FOUND" }, 404, origin);
}

const SITE_ACCESS_COOKIE = "fd_site_access";
const SITE_ACCESS_SESSION_SECONDS = 43200;
const SITE_ACCESS_EXEMPT_PATHS = new Set(["/admin","/admin/","/acces","/api/site-access/login","/api/site-access/status","/api/site-access/logout","/api/webhooks/neon-auth","/newsletter/desinscription","/logo-focom-fond-rouge.png","/logo-fd.webp"]);
function b64url(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
function unb64url(s){s=s.replace(/-/g,"+").replace(/_/g,"/");const b=atob(s+"=".repeat((4-s.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0))}
async function accessSign(payload,secret){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload)))}
async function deriveSitePassword(password,salt,iterations=100000){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);return new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256))}
function equalBytes(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0}
async function configuredSitePassword(env){const row=await env.SURVEYS_DB?.prepare("SELECT password_salt,password_hash,iterations,updated_at FROM site_access_config WHERE id=1").first();return row||null}
async function verifySitePassword(password,env){const row=await configuredSitePassword(env);if(row){try{return equalBytes(await deriveSitePassword(password,unb64url(row.password_salt),Number(row.iterations)||310000),unb64url(row.password_hash))}catch{return false}}const legacy=String(env.SITE_ACCESS_PASSWORD||"");if(!legacy)return false;const enc=new TextEncoder(),[a,b]=await Promise.all([crypto.subtle.digest("SHA-256",enc.encode(password)),crypto.subtle.digest("SHA-256",enc.encode(legacy))]);return equalBytes(new Uint8Array(a),new Uint8Array(b))}
async function hasSiteAccess(request,env){const secret=String(env.SITE_ACCESS_SIGNING_SECRET||"");if(secret.length<32)return false;const cookie=(request.headers.get("Cookie")||"").split(";").map(part=>part.trim()).find(part=>part.startsWith(SITE_ACCESS_COOKIE+"="));if(!cookie)return false;const value=cookie.slice(SITE_ACCESS_COOKIE.length+1);try{const [p,s]=value.split(".");if(!p||!s)return false;const expected=await accessSign(p,secret),given=unb64url(s);if(!equalBytes(expected,given))return false;const payload=JSON.parse(new TextDecoder().decode(unb64url(p)));if(payload.exp<=Date.now()/1000)return false;const config=await configuredSitePassword(env);if(config&&Number(payload.iat||0)<Math.floor(Date.parse(config.updated_at)/1000))return false;return true}catch{return false}}
async function siteLoginRateLimited(request,env){const ip=request.headers.get("CF-Connecting-IP");if(!ip||!env.SURVEYS_DB)return true;const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));const key=b64url(new Uint8Array(digest));const row=await env.SURVEYS_DB.prepare("SELECT attempts,window_started_at FROM site_access_login_attempts WHERE ip_hash=?").bind(key).first();if(!row)return false;return Date.now()-Date.parse(row.window_started_at)<900000&&Number(row.attempts)>=10}
async function recordSiteLoginFailure(request,env){const ip=request.headers.get("CF-Connecting-IP");if(!ip||!env.SURVEYS_DB)return;const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));const key=b64url(new Uint8Array(digest));await env.SURVEYS_DB.prepare("INSERT INTO site_access_login_attempts(ip_hash,window_started_at,attempts) VALUES(?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),1) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN site_access_login_attempts.window_started_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 minutes') THEN 1 ELSE site_access_login_attempts.attempts+1 END,window_started_at=CASE WHEN site_access_login_attempts.window_started_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 minutes') THEN excluded.window_started_at ELSE site_access_login_attempts.window_started_at END").bind(key).run()}
async function clearSiteLoginFailures(request,env){const ip=request.headers.get("CF-Connecting-IP");if(!ip||!env.SURVEYS_DB)return;const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));await env.SURVEYS_DB.prepare("DELETE FROM site_access_login_attempts WHERE ip_hash=?").bind(b64url(new Uint8Array(digest))).run()}
function constructionPage(){return new Response('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>FO Free Distribution · Site en préparation</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#f7f7f8,#fff 60%,#fbecef);font:16px system-ui;color:#24252b}main{width:min(100%,680px);padding:clamp(30px,7vw,64px);text-align:center;background:white;border:1px solid #eee;border-radius:22px;box-shadow:0 18px 60px #25262b12}img{width:74px;height:74px;border-radius:50%}.eyebrow{margin-top:20px;color:#c8102e;font-size:12px;font-weight:800;letter-spacing:2px}h1{font-size:clamp(32px,6vw,48px);line-height:1.08;letter-spacing:-1.5px}p{color:#686a73;line-height:1.75}a{display:inline-block;margin-top:18px;padding:14px 22px;border-radius:999px;background:#c8102e;color:white;text-decoration:none;font-weight:700}</style></head><body><main><img src="/logo-focom-fond-rouge.png" alt="FOCOM"><div class="eyebrow">FOCOM · FREE DISTRIBUTION</div><h1>Notre site se prépare&nbsp;!</h1><p>Nous préparons un nouvel espace d’information et d’action syndicale dédié aux salariés de Free Distribution.</p><p>Le site complet reste accessible aux salariés et représentants autorisés.</p><a href="/acces">Accès réservé</a></main></body></html>',{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-robots-tag":"noindex, nofollow"}})}
function animatedConstructionPage(){
  return new Response(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#13233a">
  <meta name="robots" content="noindex,nofollow">
  <title>FO Free Distribution · Site en préparation</title>
  <style>
    @view-transition{navigation:auto}
    :root{
      color-scheme:light;
      --red:#c8102e;
      --red-dark:#9f0c24;
      --ink:#162033;
      --muted:#687386;
      --line:#e5e9ef;
      --navy:#13233a;
      --navy-deep:#0b1525;
      --teal:#0f8f87;
      --pointer-x:72%;
      --pointer-y:24%;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      font-synthesis:none;
      text-rendering:optimizeLegibility;
    }
    *{box-sizing:border-box}
    html{min-width:320px;overflow-x:hidden}
    body{
      min-height:100svh;
      margin:0;
      display:grid;
      place-items:center;
      overflow-x:hidden;
      padding:clamp(16px,4vw,44px);
      color:var(--ink);
      background:
        radial-gradient(circle at var(--pointer-x) var(--pointer-y),rgba(200,16,46,.12),transparent 22rem),
        radial-gradient(circle at 12% 88%,rgba(15,143,135,.12),transparent 25rem),
        #eef2f7;
    }
    body::before{
      content:"";
      position:fixed;
      inset:0;
      pointer-events:none;
      opacity:.34;
      background-image:radial-gradient(rgba(19,35,58,.14) .6px,transparent .6px);
      background-size:18px 18px;
      mask-image:linear-gradient(to bottom,black,transparent 85%);
    }
    a{color:inherit}
    .prep-shell{
      position:relative;
      z-index:1;
      display:grid;
      grid-template-columns:minmax(0,1.06fr) minmax(340px,.94fr);
      width:min(1080px,100%);
      min-height:650px;
      overflow:hidden;
      border:1px solid rgba(255,255,255,.8);
      border-radius:32px;
      background:#fff;
      box-shadow:0 42px 110px -42px rgba(15,23,42,.62);
      animation:shell-in .8s cubic-bezier(.2,.72,.25,1) both;
    }
    .prep-copy{
      position:relative;
      display:flex;
      min-width:0;
      flex-direction:column;
      justify-content:center;
      overflow:hidden;
      padding:clamp(32px,5.3vw,68px);
      background:
        radial-gradient(circle at 92% 8%,rgba(200,16,46,.075),transparent 16rem),
        linear-gradient(145deg,#fff,#f8fafc);
    }
    .prep-copy::after{
      content:"";
      position:absolute;
      left:-140px;
      bottom:-190px;
      width:380px;
      height:380px;
      border:1px solid rgba(200,16,46,.09);
      border-radius:50%;
      box-shadow:0 0 0 55px rgba(200,16,46,.022),0 0 0 110px rgba(15,143,135,.018);
      animation:soft-orbit 18s ease-in-out infinite alternate;
    }
    .brand-row{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:18px}
    .brand{display:flex;align-items:center;gap:13px}
    .brand img{width:52px;height:52px;border-radius:50%;box-shadow:0 12px 28px -14px rgba(200,16,46,.65)}
    .brand span{display:block}
    .brand strong{font-size:14px;letter-spacing:-.02em}
    .brand small{display:block;margin-top:4px;color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
    .status-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid #e0e6ee;border-radius:999px;background:rgba(255,255,255,.75);padding:8px 11px;color:#536074;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;backdrop-filter:blur(8px)}
    .status-dot{position:relative;width:8px;height:8px;border-radius:50%;background:var(--teal)}
    .status-dot::after{content:"";position:absolute;inset:-4px;border:1px solid rgba(15,143,135,.35);border-radius:50%;animation:pulse 2.2s ease-out infinite}
    .hero-copy{position:relative;z-index:1;margin:clamp(34px,6vh,62px) 0 0}
    .eyebrow{margin:0 0 13px;color:var(--red);font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
    .hero-copy h1{max-width:660px;margin:0;font-size:clamp(38px,5.6vw,68px);line-height:.96;letter-spacing:-.062em;text-wrap:balance}
    .hero-copy p{max-width:58ch;margin:20px 0 0;color:var(--muted);font-size:clamp(14px,1.6vw,17px);line-height:1.72;text-wrap:pretty}
    .prep-meter{position:relative;z-index:1;max-width:520px;margin-top:31px}
    .meter-head{display:flex;align-items:center;justify-content:space-between;gap:20px;color:#536074;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
    .meter-track{height:7px;margin-top:10px;overflow:hidden;border-radius:999px;background:#e9edf2}
    .meter-fill{position:relative;width:76%;height:100%;overflow:hidden;border-radius:inherit;background:linear-gradient(90deg,var(--red),#e2485f 58%,var(--teal));box-shadow:0 0 18px rgba(200,16,46,.22);animation:meter-in 1.2s .3s cubic-bezier(.2,.72,.25,1) both}
    .meter-fill::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 25%,rgba(255,255,255,.55) 48%,transparent 70%);translate:-120% 0;animation:shine 2.8s 1.2s ease-in-out infinite}
    .access-button{
      position:relative;
      z-index:1;
      display:flex;
      width:fit-content;
      min-height:52px;
      align-items:center;
      justify-content:center;
      gap:10px;
      overflow:hidden;
      margin-top:30px;
      border:1px solid #e42a45;
      border-radius:14px;
      background:linear-gradient(135deg,#dd1a38,var(--red));
      padding:0 20px;
      color:#fff;
      font-size:13px;
      font-weight:900;
      text-decoration:none;
      box-shadow:0 18px 34px -20px rgba(200,16,46,.9);
      transition:transform .2s ease,box-shadow .2s ease,filter .2s ease;
    }
    .access-button::before{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 25%,rgba(255,255,255,.2) 48%,transparent 70%);translate:-120% 0;transition:translate .55s ease}
    .access-button:hover{transform:translateY(-2px);filter:saturate(1.1);box-shadow:0 23px 40px -18px rgba(200,16,46,.95)}
    .access-button:hover::before{translate:120% 0}
    .access-arrow{font-size:17px;transition:translate .2s ease}
    .access-button:hover .access-arrow{translate:3px 0}
    .button-spinner{display:none;width:17px;height:17px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:spin .75s linear infinite}
    .access-button[data-loading="true"] .button-spinner{display:block}
    .access-button[data-loading="true"] .access-arrow{display:none}
    .prep-note{position:relative;z-index:1;margin:16px 0 0;color:#8791a1;font-size:11px;line-height:1.55}
    .preview-panel{
      position:relative;
      display:flex;
      min-width:0;
      flex-direction:column;
      justify-content:space-between;
      overflow:hidden;
      padding:clamp(30px,4.5vw,54px);
      background:
        radial-gradient(circle at 110% 0%,rgba(15,143,135,.24),transparent 19rem),
        linear-gradient(150deg,#16273d,var(--navy) 55%,var(--navy-deep));
      color:#fff;
    }
    .preview-panel::before{content:"";position:absolute;right:-145px;top:-130px;width:380px;height:380px;border:60px solid rgba(255,255,255,.035);border-radius:50%;animation:soft-orbit 15s ease-in-out infinite alternate-reverse}
    .preview-label{position:relative;z-index:1;color:#99f6e4;font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}
    .signal-visual{position:relative;z-index:1;display:grid;place-items:center;min-height:280px}
    .signal-orbit{position:relative;display:grid;width:min(230px,65%);aspect-ratio:1;place-items:center;border:1px solid rgba(255,255,255,.08);border-radius:50%;box-shadow:0 0 0 38px rgba(255,255,255,.022),0 0 0 76px rgba(255,255,255,.014)}
    .signal-orbit::before{content:"";position:absolute;inset:18%;border-radius:50%;background:conic-gradient(from 60deg,transparent,var(--red),#ef4960,var(--teal),transparent 68%);mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 0);animation:spin 9s linear infinite}
    .signal-core{position:relative;display:grid;width:82px;height:82px;place-items:center;border:1px solid rgba(255,255,255,.13);border-radius:24px;background:rgba(255,255,255,.09);box-shadow:0 22px 50px rgba(0,0,0,.3);backdrop-filter:blur(12px);animation:float 4.6s ease-in-out infinite}
    .signal-core img{width:56px;height:56px;border-radius:50%}
    .orbit-dot{position:absolute;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 18px rgba(255,255,255,.7)}
    .orbit-dot.one{left:6%;top:48%}.orbit-dot.two{right:18%;top:9%;width:7px;height:7px;background:#5eead4}.orbit-dot.three{right:2%;bottom:26%;background:#fb7185}
    .prep-steps{position:relative;z-index:1;display:grid;gap:9px}
    .step{display:grid;grid-template-columns:9px 1fr auto;align-items:center;gap:11px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.055);padding:12px 13px;color:rgba(255,255,255,.78);backdrop-filter:blur(8px);animation:step-in .55s cubic-bezier(.2,.72,.25,1) both}
    .step:nth-child(2){animation-delay:.12s}.step:nth-child(3){animation-delay:.24s}
    .step-dot{width:8px;height:8px;border-radius:50%;background:#5eead4;box-shadow:0 0 0 4px rgba(94,234,212,.1)}
    .step strong{display:block;color:#fff;font-size:11px}.step small{display:block;margin-top:3px;color:rgba(255,255,255,.45);font-size:9px}
    .step b{color:#99f6e4;font-size:10px}
    .preview-footer{position:relative;z-index:1;display:flex;align-items:center;gap:8px;margin-top:20px;color:rgba(255,255,255,.42);font-size:10px}
    .preview-footer::before{content:"";width:7px;height:7px;border-radius:50%;background:#34d399}
    @keyframes shell-in{from{opacity:0;transform:translateY(24px) scale(.985)}to{opacity:1;transform:none}}
    @keyframes meter-in{from{width:0}to{width:76%}}
    @keyframes shine{0%,40%{translate:-120% 0}80%,100%{translate:120% 0}}
    @keyframes pulse{0%{opacity:.8;transform:scale(.7)}75%,100%{opacity:0;transform:scale(1.45)}}
    @keyframes orbit-rotate{to{transform:rotate(360deg)}}
    @keyframes spin{to{rotate:360deg}}
    @keyframes soft-orbit{to{transform:rotate(10deg) scale(1.04)}}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    @keyframes step-in{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
    @media(max-width:850px){
      body{padding:14px}
      .prep-shell{grid-template-columns:1fr;min-height:0;border-radius:24px}
      .prep-copy{padding:28px 24px 30px}
      .hero-copy{margin-top:34px}
      .hero-copy h1{font-size:clamp(36px,9vw,58px)}
      .preview-panel{padding:28px 24px;min-height:350px}
      .signal-visual{min-height:230px}
    }
    @media(max-width:480px){
      body{padding:0;background:var(--navy)}
      .prep-shell{border:0;border-radius:0;min-height:100svh}
      .prep-copy{padding:22px 18px 28px}
      .brand img{width:44px;height:44px}
      .status-chip{font-size:8px;padding:7px 9px}
      .hero-copy h1{font-size:40px}
      .access-button{width:100%}
      .preview-panel{padding:26px 18px 30px}
    }
    @media(prefers-reduced-motion:reduce){
      *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
    }
  </style>
</head>
<body>
  <main class="prep-shell">
    <section class="prep-copy">
      <div class="brand-row">
        <div class="brand">
          <img src="/logo-focom-fond-rouge.png" alt="FOCOM">
          <div><strong>FO COM · Free Distribution</strong><small>Le syndicat des salariés</small></div>
        </div>
        <span class="status-chip"><span class="status-dot" aria-hidden="true"></span> Site en préparation</span>
      </div>
      <div class="hero-copy">
        <p class="eyebrow">FOCOM · FREE DISTRIBUTION</p>
        <h1>Notre site se prépare&nbsp;!</h1>
        <p>Nous construisons un nouvel espace d’information et d’action syndicale dédié aux salariés de Free Distribution. Une expérience plus claire, plus rapide et plus utile.</p>
      </div>
      <div class="prep-meter" aria-label="Avancement du site : 76 %">
        <div class="meter-head"><span>Préparation du site</span><span>76 %</span></div>
        <div class="meter-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="76"><div class="meter-fill"></div></div>
      </div>
      <a class="access-button" id="access-link" href="/acces">
        <span class="button-spinner" aria-hidden="true"></span>
        <span class="access-label">Accès réservé</span>
        <span class="access-arrow" aria-hidden="true">→</span>
      </a>
      <p class="prep-note" id="access-status" role="status" aria-live="polite">Le site complet reste accessible aux salariés et représentants autorisés.</p>
    </section>
    <aside class="preview-panel" aria-label="Avancement de la mise en ligne">
      <span class="preview-label">Mise en ligne progressive</span>
      <div class="signal-visual" aria-hidden="true">
        <div class="signal-orbit">
          <span class="orbit-dot one"></span><span class="orbit-dot two"></span><span class="orbit-dot three"></span>
          <div class="signal-core"><img src="/logo-focom-fond-rouge.png" alt=""></div>
        </div>
      </div>
      <div class="prep-steps">
        <div class="step"><span class="step-dot"></span><div><strong>Information syndicale</strong><small>Actualités et prises de position</small></div><b>Prêt</b></div>
        <div class="step"><span class="step-dot"></span><div><strong>Espace salariés</strong><small>Droits et ressources utiles</small></div><b>En cours</b></div>
        <div class="step"><span class="step-dot"></span><div><strong>Accès sécurisé</strong><small>Ouvert aux personnes autorisées</small></div><b>Actif</b></div>
      </div>
      <div class="preview-footer">FOCOM · Free Distribution</div>
    </aside>
  </main>
  <script>
    (() => {
      const link = document.querySelector('#access-link');
      const label = link.querySelector('.access-label');
      const status = document.querySelector('#access-status');
      let pointerFrame = 0;

      document.addEventListener('pointermove', event => {
        if (pointerFrame) return;
        pointerFrame = requestAnimationFrame(() => {
          document.documentElement.style.setProperty('--pointer-x', (event.clientX / innerWidth * 100).toFixed(2) + '%');
          document.documentElement.style.setProperty('--pointer-y', (event.clientY / innerHeight * 100).toFixed(2) + '%');
          pointerFrame = 0;
        });
      }, { passive: true });

      link.addEventListener('click', event => {
        event.preventDefault();
        if (link.dataset.loading === 'true') return;
        link.dataset.loading = 'true';
        link.setAttribute('aria-busy', 'true');
        label.textContent = 'Ouverture de l’accès…';
        status.textContent = 'Redirection sécurisée vers l’espace réservé.';
        const navigate = () => location.assign('/acces');
        if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          document.startViewTransition(navigate);
        } else {
          window.setTimeout(navigate, 220);
        }
      });
    })();
  </script>
</body>
</html>`,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-robots-tag":"noindex, nofollow","content-security-policy":"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
function maintenancePage(message){const safe=String(message||"Maintenance programmée").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));return new Response('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Maintenance · FO Free Distribution</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#f7f7f8,#fff 60%,#fbecef);font:16px system-ui;color:#24252b}main{width:min(100%,680px);padding:clamp(30px,7vw,64px);text-align:center;background:white;border:1px solid #eee;border-radius:22px;box-shadow:0 18px 60px #25262b12}h1{font-size:clamp(30px,6vw,44px)}p{color:#686a73;line-height:1.8;white-space:pre-line}</style></head><body><main><h1>Maintenance programmée</h1><p>'+safe+'</p></main></body></html>',{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-robots-tag":"noindex, nofollow"}})}
function modernAccessLoginPage(configured){
  const availability = configured ? "" : "disabled";
  const initialStatus = configured ? "" : "L’accès au site n’est pas encore configuré. Contactez un administrateur.";
  return new Response(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#111c2d">
  <meta name="robots" content="noindex,nofollow">
  <title>Accès réservé · FO Free Distribution</title>
  <style>
    @view-transition{navigation:auto}
    :root{
      color-scheme:light;
      --red:#c8102e;
      --red-dark:#9f0c24;
      --ink:#172033;
      --muted:#667085;
      --line:#e4e8ef;
      --paper:#f5f7fa;
      --navy:#111c2d;
      --teal:#0f8f87;
      --pointer-x:72%;
      --pointer-y:24%;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      font-synthesis:none;
      text-rendering:optimizeLegibility;
    }
    *{box-sizing:border-box}
    html{min-width:320px;overflow-x:hidden}
    body{
      min-height:100svh;
      margin:0;
      overflow-x:hidden;
      display:grid;
      place-items:center;
      padding:clamp(16px,4vw,46px);
      color:var(--ink);
      background:
        radial-gradient(circle at var(--pointer-x) var(--pointer-y),rgba(200,16,46,.2),transparent 24rem),
        radial-gradient(circle at 10% 90%,rgba(15,143,135,.16),transparent 25rem),
        linear-gradient(145deg,#0d1726,#17263b 58%,#0b1422);
    }
    body::before{
      content:"";
      position:fixed;
      inset:0;
      pointer-events:none;
      opacity:.18;
      background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
      background-size:42px 42px;
      mask-image:linear-gradient(to bottom,black,transparent 82%);
    }
    button,input{font:inherit}
    button{cursor:pointer}
    .access-shell{
      position:relative;
      z-index:1;
      display:grid;
      grid-template-columns:minmax(0,1.15fr) minmax(350px,.85fr);
      width:min(1120px,100%);
      min-height:640px;
      overflow:hidden;
      border:1px solid rgba(255,255,255,.2);
      border-radius:32px;
      background:#fff;
      box-shadow:0 40px 110px -38px rgba(0,0,0,.85),0 1px 0 rgba(255,255,255,.25) inset;
      animation:shell-in .72s cubic-bezier(.2,.72,.25,1) both;
    }
    .brand-panel{
      position:relative;
      display:flex;
      min-width:0;
      flex-direction:column;
      justify-content:space-between;
      overflow:hidden;
      padding:clamp(28px,5vw,62px);
      background:
        radial-gradient(circle at 92% 8%,rgba(200,16,46,.08),transparent 18rem),
        linear-gradient(160deg,#fff,#f7f8fa);
    }
    .brand-panel::after{
      content:"";
      position:absolute;
      right:-100px;
      bottom:-150px;
      width:360px;
      height:360px;
      border:1px solid rgba(200,16,46,.11);
      border-radius:50%;
      box-shadow:0 0 0 54px rgba(200,16,46,.025),0 0 0 108px rgba(200,16,46,.018);
      animation:orbit 16s ease-in-out infinite alternate;
    }
    .brand-top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:18px}
    .secure-chip{
      display:inline-flex;
      align-items:center;
      gap:8px;
      border:1px solid #e2e7ee;
      border-radius:999px;
      background:rgba(255,255,255,.75);
      padding:8px 12px;
      color:#4b5568;
      font-size:11px;
      font-weight:800;
      letter-spacing:.08em;
      text-transform:uppercase;
      backdrop-filter:blur(8px);
    }
    .secure-dot{width:7px;height:7px;border-radius:50%;background:#16834a;box-shadow:0 0 0 4px rgba(22,131,74,.12)}
    .brand-logo{
      position:relative;
      z-index:1;
      display:block;
      width:min(100%,760px);
      height:auto;
      margin:26px 0;
      filter:drop-shadow(0 22px 28px rgba(32,33,38,.08));
      animation:logo-in .9s .12s cubic-bezier(.2,.72,.25,1) both;
    }
    .brand-copy{position:relative;z-index:1;max-width:620px}
    .eyebrow{margin:0 0 12px;color:var(--red);font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
    .brand-copy h2{margin:0;font-size:clamp(25px,3.2vw,38px);line-height:1.08;letter-spacing:-.045em;text-wrap:balance}
    .brand-copy p{max-width:55ch;margin:14px 0 0;color:var(--muted);font-size:clamp(13px,1.4vw,16px);line-height:1.7;text-wrap:pretty}
    .trust-list{display:flex;flex-wrap:wrap;gap:9px;margin-top:24px}
    .trust-list span{display:inline-flex;align-items:center;gap:7px;border:1px solid #e2e7ee;border-radius:999px;background:#fff;padding:8px 11px;color:#4c586a;font-size:11px;font-weight:700}
    .trust-list span::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--teal)}
    .login-panel{
      position:relative;
      display:flex;
      min-width:0;
      flex-direction:column;
      justify-content:center;
      overflow:hidden;
      padding:clamp(30px,4.8vw,56px);
      background:
        radial-gradient(circle at 100% 0%,rgba(15,143,135,.2),transparent 20rem),
        linear-gradient(155deg,#16263c,var(--navy));
      color:#fff;
    }
    .login-panel::before{
      content:"";
      position:absolute;
      right:-120px;
      top:-120px;
      width:320px;
      height:320px;
      border:52px solid rgba(255,255,255,.035);
      border-radius:50%;
    }
    .login-content{position:relative;z-index:1;width:100%;max-width:430px;margin:auto}
    .login-icon{display:grid;width:50px;height:50px;place-items:center;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.08);color:#99f6e4;box-shadow:0 12px 30px rgba(0,0,0,.18);backdrop-filter:blur(10px)}
    .login-icon svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .login-content h1{margin:24px 0 0;font-size:clamp(30px,4.1vw,45px);line-height:1;letter-spacing:-.055em;text-wrap:balance}
    .login-intro{margin:12px 0 0;color:rgba(255,255,255,.62);font-size:14px;line-height:1.65;text-wrap:pretty}
    .login-form{display:grid;gap:16px;margin-top:30px}
    .field{display:grid;gap:8px}
    .field label{color:rgba(255,255,255,.82);font-size:12px;font-weight:800}
    .input-wrap{position:relative}
    .input-wrap>svg{position:absolute;left:15px;top:50%;width:18px;height:18px;translate:0 -50%;color:rgba(255,255,255,.42);fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
    .password-input{
      width:100%;
      height:52px;
      border:1px solid rgba(255,255,255,.14);
      border-radius:14px;
      background:rgba(255,255,255,.075);
      padding:0 78px 0 47px;
      color:#fff;
      font-size:16px;
      outline:0;
      transition:border-color .2s ease,background .2s ease,box-shadow .2s ease;
      backdrop-filter:blur(8px);
    }
    .password-input::placeholder{color:rgba(255,255,255,.34)}
    .password-input:focus{border-color:rgba(45,212,191,.7);background:rgba(255,255,255,.1);box-shadow:0 0 0 4px rgba(45,212,191,.12)}
    .password-input:disabled{opacity:.55;cursor:not-allowed}
    .password-toggle{
      position:absolute;
      right:8px;
      top:50%;
      translate:0 -50%;
      border:0;
      border-radius:10px;
      background:transparent;
      padding:8px 10px;
      color:rgba(255,255,255,.58);
      font-size:11px;
      font-weight:800;
    }
    .password-toggle:hover{background:rgba(255,255,255,.08);color:#fff}
    .submit-button{
      position:relative;
      display:flex;
      height:52px;
      align-items:center;
      justify-content:center;
      gap:10px;
      overflow:hidden;
      border:1px solid #ef3d57;
      border-radius:14px;
      background:linear-gradient(135deg,#db1735,var(--red));
      color:#fff;
      font-size:13px;
      font-weight:900;
      box-shadow:0 18px 34px -19px rgba(220,38,38,.85);
      transition:transform .2s ease,filter .2s ease,box-shadow .2s ease;
    }
    .submit-button::before{
      content:"";
      position:absolute;
      inset:0;
      background:linear-gradient(110deg,transparent 25%,rgba(255,255,255,.18) 48%,transparent 70%);
      translate:-120% 0;
      transition:translate .55s ease;
    }
    .submit-button:hover:not(:disabled){transform:translateY(-2px);filter:saturate(1.08);box-shadow:0 22px 38px -18px rgba(220,38,38,.95)}
    .submit-button:hover:not(:disabled)::before{translate:120% 0}
    .submit-button:disabled{opacity:.62;cursor:not-allowed;box-shadow:none}
    .submit-arrow{font-size:17px;transition:translate .2s ease}
    .submit-button:hover:not(:disabled) .submit-arrow{translate:3px 0}
    .spinner{display:none;width:17px;height:17px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:spin .75s linear infinite}
    .submit-button[data-loading="true"] .spinner{display:block}
    .submit-button[data-loading="true"] .submit-arrow{display:none}
    .status{
      min-height:22px;
      margin:0;
      border-radius:10px;
      color:rgba(255,255,255,.58);
      font-size:12px;
      line-height:1.5;
      text-align:center;
      transition:color .2s ease,background .2s ease,padding .2s ease;
    }
    .status[data-state="error"]{padding:10px 12px;background:rgba(248,113,113,.12);color:#fecaca}
    .status[data-state="success"]{padding:10px 12px;background:rgba(52,211,153,.12);color:#a7f3d0}
    .security-note{display:flex;gap:11px;margin-top:10px;border-top:1px solid rgba(255,255,255,.09);padding-top:18px;color:rgba(255,255,255,.48);font-size:11px;line-height:1.55}
    .security-note svg{width:16px;height:16px;flex:0 0 auto;margin-top:1px;color:#5eead4;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .back-link{display:inline-flex;align-items:center;gap:8px;margin-top:22px;color:rgba(255,255,255,.54);font-size:12px;font-weight:700;text-decoration:none;transition:color .2s ease,gap .2s ease}
    .back-link:hover{color:#fff;gap:11px}
    .access-shell.has-error{animation:shake .36s ease}
    @keyframes shell-in{from{opacity:0;transform:translateY(22px) scale(.985)}to{opacity:1;transform:none}}
    @keyframes logo-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
    @keyframes orbit{to{transform:rotate(12deg) scale(1.04)}}
    @keyframes spin{to{rotate:360deg}}
    @keyframes shake{20%{translate:-5px 0}40%{translate:5px 0}60%{translate:-3px 0}80%{translate:3px 0}}
    @media(max-width:860px){
      body{padding:14px}
      .access-shell{grid-template-columns:1fr;min-height:0;border-radius:24px}
      .brand-panel{padding:26px 24px 24px}
      .brand-top{display:none}
      .brand-logo{width:min(100%,620px);margin:0 auto 22px}
      .brand-copy{text-align:center;margin:auto}
      .brand-copy p{margin-inline:auto}
      .trust-list{justify-content:center}
      .login-panel{padding:34px 24px 30px}
      .login-content{max-width:520px}
      .login-icon{width:44px;height:44px;border-radius:14px}
      .login-content h1{font-size:34px}
    }
    @media(max-width:460px){
      body{padding:0;background:var(--navy)}
      .access-shell{border:0;border-radius:0;min-height:100svh}
      .brand-panel{padding:22px 18px 18px}
      .brand-copy h2{font-size:25px}
      .brand-copy p{font-size:13px}
      .trust-list{gap:6px}.trust-list span{font-size:9px;padding:7px 9px}
      .login-panel{padding:30px 20px 26px}
      .login-content h1{font-size:31px}
      .login-form{margin-top:24px}
    }
    @media(prefers-reduced-motion:reduce){
      *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
    }
  </style>
</head>
<body>
  <main class="access-shell" id="access-shell">
    <section class="brand-panel" aria-labelledby="access-context-title">
      <div class="brand-top">
        <span class="secure-chip"><span class="secure-dot" aria-hidden="true"></span> Espace sécurisé</span>
        <span class="secure-chip">FOCOM · Free Distribution</span>
      </div>
      <img class="brand-logo" src="/logo-fd.webp" width="1600" height="668" alt="FOCOM Free Distribution – Le syndicat des salariés de Free Distribution">
      <div class="brand-copy">
        <p class="eyebrow">Information et action syndicale</p>
        <h2 id="access-context-title">Un espace confidentiel réservé aux salariés et représentants autorisés.</h2>
        <p>Retrouvez les actualités, les revendications et les ressources FO Free Distribution dans un environnement d’accès protégé.</p>
        <div class="trust-list" aria-label="Garanties de sécurité">
          <span>Accès limité</span>
          <span>Session sécurisée</span>
          <span>Usage professionnel</span>
        </div>
      </div>
    </section>

    <section class="login-panel" aria-labelledby="access-title">
      <div class="login-content">
        <div class="login-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v2"/></svg></div>
        <h1 id="access-title">Accès réservé</h1>
        <p class="login-intro">Saisissez le mot de passe communiqué aux salariés et représentants autorisés.</p>
        <form class="login-form" id="f">
          <div class="field">
            <label for="p">Mot de passe commun</label>
            <div class="input-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v2"/></svg>
              <input class="password-input" id="p" name="password" type="password" autocomplete="current-password" maxlength="256" required aria-describedby="s" ${availability}>
              <button class="password-toggle" id="toggle-password" type="button" aria-pressed="false" aria-controls="p">Afficher</button>
            </div>
          </div>
          <button class="submit-button" type="submit" ${availability}>
            <span class="spinner" aria-hidden="true"></span>
            <span class="submit-label">Accéder au site</span>
            <span class="submit-arrow" aria-hidden="true">→</span>
          </button>
          <p class="status" id="s" role="status" aria-live="polite">${initialStatus}</p>
        </form>
        <div class="security-note">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.2c0 4.7 3.2 8.1 7.5 9.8 4.3-1.7 7.5-5.1 7.5-9.8V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>
          <span>Les tentatives sont limitées pour protéger l’accès. Votre session expire automatiquement après 12 heures.</span>
        </div>
        <a class="back-link" href="/">← Retour à l’accueil</a>
      </div>
    </section>
  </main>
  <script>
    (() => {
      const shell = document.querySelector('#access-shell');
      const form = document.querySelector('#f');
      const field = document.querySelector('#p');
      const status = document.querySelector('#s');
      const button = form.querySelector('button[type="submit"]');
      const label = button.querySelector('.submit-label');
      const toggle = document.querySelector('#toggle-password');
      let pointerFrame = 0;

      const setStatus = (message, state = '') => {
        const update = () => {
          status.textContent = message;
          status.dataset.state = state;
        };
        if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          document.startViewTransition(update);
        } else {
          update();
        }
      };

      toggle.addEventListener('click', () => {
        const reveal = field.type === 'password';
        field.type = reveal ? 'text' : 'password';
        toggle.textContent = reveal ? 'Masquer' : 'Afficher';
        toggle.setAttribute('aria-pressed', String(reveal));
        field.focus();
      });

      field.addEventListener('input', () => {
        if (status.dataset.state === 'error') setStatus('');
      });

      document.addEventListener('pointermove', event => {
        if (pointerFrame) return;
        pointerFrame = requestAnimationFrame(() => {
          document.documentElement.style.setProperty('--pointer-x', (event.clientX / innerWidth * 100).toFixed(2) + '%');
          document.documentElement.style.setProperty('--pointer-y', (event.clientY / innerHeight * 100).toFixed(2) + '%');
          pointerFrame = 0;
        });
      }, { passive: true });

      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled) return;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        button.disabled = true;
        button.dataset.loading = 'true';
        button.setAttribute('aria-busy', 'true');
        label.textContent = 'Vérification…';
        setStatus('Vérification du mot de passe en cours…');
        try {
          const response = await fetch('/api/site-access/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: field.value }),
            signal: controller.signal,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || 'Mot de passe incorrect.');
          setStatus('Accès autorisé. Ouverture du site…', 'success');
          label.textContent = 'Accès autorisé';
          const redirect = () => location.replace('/');
          if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.startViewTransition(redirect);
          } else {
            redirect();
          }
        } catch (error) {
          setStatus(error?.name === 'AbortError' ? 'La vérification a expiré. Vérifiez votre connexion puis réessayez.' : (error.message || 'Mot de passe incorrect.'), 'error');
          shell.classList.remove('has-error');
          void shell.offsetWidth;
          shell.classList.add('has-error');
          field.select();
          button.disabled = false;
          button.dataset.loading = 'false';
          button.removeAttribute('aria-busy');
          label.textContent = 'Réessayer';
        } finally {
          window.clearTimeout(timeout);
        }
      });
    })();
  </script>
</body>
</html>`,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-robots-tag":"noindex, nofollow","content-security-policy":"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
function accessLoginPage(configured){return new Response('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Accès réservé · FO Free Distribution</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:#f5f5f6;color:#24252b;font:16px system-ui}main{width:min(100%,440px);padding:34px;background:white;border:1px solid #e8e8eb;border-radius:18px}img{width:58px;height:58px;border-radius:50%}h1{font-size:27px}.muted{color:#6e7079;line-height:1.6;font-size:14px}label{display:block;margin:24px 0 8px;font-weight:700}input,button{width:100%;padding:14px;border-radius:9px;font:inherit}input{border:1px solid #d8d9de}button{margin-top:16px;border:0;background:#c8102e;color:white;font-weight:700;cursor:pointer}.status{color:#a10e28;font-size:13px;min-height:24px}a{display:block;text-align:center;margin-top:20px;color:#666;font-size:13px}</style></head><body><main><img src="/logo-focom-fond-rouge.png" alt="FOCOM"><h1>Accès réservé</h1><p class="muted">Saisissez le mot de passe communiqué aux salariés et représentants autorisés.</p><form id="f"><label for="p">Mot de passe commun</label><input id="p" type="password" autocomplete="current-password" maxlength="256" required ' + (configured?"":"disabled") + '><button ' + (configured?"":"disabled") + '>Accéder au site</button><p class="status" id="s" role="status"></p></form><a href="/">← Retour à l’accueil</a></main><script>const f=document.querySelector("#f"),s=document.querySelector("#s"),b=f.querySelector("button");f.addEventListener("submit",async e=>{e.preventDefault();b.disabled=true;s.textContent="Vérification…";try{const r=await fetch("/api/site-access/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:f.elements.p.value})});const d=await r.json();if(!r.ok)throw Error(d.message||"Mot de passe incorrect");location.replace("/")}catch(x){s.textContent=x.message;b.disabled=false}})</script></body></html>',{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-robots-tag":"noindex, nofollow"}})}
async function handleSiteAccess(request,env,url){const secret=String(env.SITE_ACCESS_SIGNING_SECRET||"");const row=url.pathname==="/api/site-access/login"?await configuredSitePassword(env):null;const configured=secret.length>=32&&(!!row||String(env.SITE_ACCESS_PASSWORD||"").length>=12);if(url.pathname==="/acces"&&request.method==="GET")return modernAccessLoginPage(configured);if(url.pathname==="/api/site-access/status"&&request.method==="GET")return json({authenticated:configured&&await hasSiteAccess(request,env)});if(url.pathname==="/api/site-access/logout"&&request.method==="POST")return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","cache-control":"no-store","set-cookie":SITE_ACCESS_COOKIE+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"}});if(url.pathname==="/api/site-access/login"&&request.method==="POST"){if(!configured)return json({error:"ACCESS_NOT_CONFIGURED"},503);if(request.headers.get("Origin")!==url.origin||request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return json({error:"INVALID_REQUEST"},403);let body;try{body=await request.json()}catch{return json({error:"INVALID_JSON"},400)}const supplied=typeof body.password==="string"?body.password:"";if(supplied.length>256)return json({error:"INVALID_PASSWORD",message:"Mot de passe incorrect."},401);if(await siteLoginRateLimited(request,env))return json({error:"TOO_MANY_ATTEMPTS",message:"Trop de tentatives. Réessayez dans 15 minutes."},429);if(!await verifySitePassword(supplied,env)){await recordSiteLoginFailure(request,env);return json({error:"INVALID_PASSWORD",message:"Mot de passe incorrect."},401)}await clearSiteLoginFailures(request,env);const now=Math.floor(Date.now()/1000),payload=b64url(new TextEncoder().encode(JSON.stringify({iat:now,exp:now+SITE_ACCESS_SESSION_SECONDS}))),signature=b64url(await accessSign(payload,secret));return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","cache-control":"no-store","set-cookie":SITE_ACCESS_COOKIE+"="+payload+"."+signature+"; Path=/; Max-Age="+SITE_ACCESS_SESSION_SECONDS+"; HttpOnly; Secure; SameSite=Lax"}})}return null}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const isAdminPath=url.pathname==="/admin"||url.pathname==="/admin/"||url.pathname.startsWith("/api/admin/");
    const isStaticAsset=url.pathname.startsWith("/assets/")||url.pathname==="/favicon.ico"||url.pathname==="/favicon.svg";
    const accessResponse = await handleSiteAccess(request, env, url);
    if (accessResponse) return accessResponse;
    if (!isAdminPath && !isStaticAsset && !SITE_ACCESS_EXEMPT_PATHS.has(url.pathname) && !await hasSiteAccess(request, env)) {
      if (url.pathname.startsWith("/api/")) return json({ error: "SITE_ACCESS_REQUIRED" }, 401, origin);
      return animatedConstructionPage();
    }
    if(!isAdminPath && !isStaticAsset && !url.pathname.startsWith("/api/") && !SITE_ACCESS_EXEMPT_PATHS.has(url.pathname) && env.SURVEYS_DB){
      try{
        const maintenance=await env.SURVEYS_DB.prepare("SELECT enabled,starts_at,ends_at,message FROM site_maintenance WHERE id=1").first();
        const now=Date.now(),start=maintenance?.starts_at?Date.parse(maintenance.starts_at):-Infinity,end=maintenance?.ends_at?Date.parse(maintenance.ends_at):Infinity;
        if(maintenance?.enabled&&now>=start&&now<end)return maintenancePage(maintenance.message);
      }catch(error){console.error("Maintenance status unavailable:",error?.name||"Error")}
    }

    if (url.pathname.startsWith("/api/") && origin && !isOriginAllowed(origin, env)) {
      return new Response(null, { status: 403 });
    }

    if (url.pathname === "/api/webhooks/neon-auth") return handleNeonAuthWebhook(request, env);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
          "access-control-max-age": "86400",
          "vary": "Origin",
        },
      });
    }

    if (url.pathname.startsWith("/media/") && request.method === "GET") {
      if (!env.MEDIA) return new Response("Not found", { status: 404 });
      let key;
      try { key = url.pathname.slice("/media/".length).split("/").map(decodeURIComponent).join("/"); }
      catch { return new Response("Bad request", { status: 400 }); }
      if (!key.startsWith("uploads/") || key.includes("..")) return new Response("Not found", { status: 404 });
      const object = await env.MEDIA.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("x-content-type-options", "nosniff");
      return new Response(object.body, { headers });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      try {
        const result = await withDatabase(env, (db) => db.query("SELECT 1 AS connected"));
        return json({ ok: true, database: result.rows[0]?.connected === 1 }, 200, origin);
      } catch (error) {
        console.error("Health check failed:", error.message);
        const configured = error.message !== "DATABASE_NOT_CONFIGURED";
        return json({ ok: false, database: false, reason: configured ? "DATABASE_UNAVAILABLE" : "DATABASE_NOT_CONFIGURED" }, 503, origin);
      }
    }

    if (url.pathname === "/robots.txt" && request.method === "GET") {
      return new Response("User-agent: *\\nAllow: /\\nDisallow: /admin\\nDisallow: /api/\\nSitemap: https://fd.focom-iliad.fr/sitemap.xml\\n", {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" }
      });
    }

    if (url.pathname === "/sitemap.xml" && request.method === "GET") {
      try {
        const result = await withDatabase(env, db => db.query(
          "SELECT slug, updated_at, published_at FROM articles WHERE status='published' AND published_at <= NOW() ORDER BY published_at DESC LIMIT 1000"
        ));
        const entries = result.rows.map(article => {
          const loc = "https://fd.focom-iliad.fr/actualites/" + encodeURIComponent(article.slug);
          const lastmod = new Date(article.updated_at || article.published_at).toISOString();
          return "<url><loc>" + loc + "</loc><lastmod>" + lastmod + "</lastmod></url>";
        }).join("");
        const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
          '<url><loc>https://fd.focom-iliad.fr/</loc></url>' + entries + '</urlset>';
        return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
      } catch (error) {
        console.error("Sitemap generation failed:", error.message);
        return new Response("Sitemap temporairement indisponible", { status: 503 });
      }
    }

    const seoArticleMatch = url.pathname.match(new RegExp("^/actualites/([a-z0-9-]+)/?$", "i"));
    if (seoArticleMatch && request.method === "GET") {
      try {
        const slug = decodeURIComponent(seoArticleMatch[1]);
        const result = await withDatabase(env, db => db.query(
          "SELECT title, excerpt, cover_image_url, category FROM articles WHERE slug=$1 AND status='published' AND published_at <= NOW() LIMIT 1",
          [slug]
        ));
        if (!result.rows.length) return new Response("Article introuvable", { status: 404 });
        const article = result.rows[0];
        const escapeMeta = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        const description = escapeMeta((article.excerpt || article.title).split(" ").join(" ").slice(0, 250));
        const title = escapeMeta(article.title + " – FO Free Distribution");
        const canonical = "https://fd.focom-iliad.fr/actualites/" + encodeURIComponent(slug);
        const image = article.cover_image_url ? '<meta property="og:image" content="' + escapeMeta(article.cover_image_url) + '">' : "";
        const tags = '<title>' + title + '</title>' +
          '<meta name="description" content="' + description + '">' +
          '<link rel="canonical" href="' + canonical + '">' +
          '<meta property="og:type" content="article">' +
          '<meta property="og:site_name" content="FO Free Distribution">' +
          '<meta property="og:title" content="' + title + '">' +
          '<meta property="og:description" content="' + description + '">' +
          '<meta property="og:url" content="' + canonical + '">' + image +
          '<meta name="twitter:card" content="' + (article.cover_image_url ? "summary_large_image" : "summary") + '">' +
          '<meta name="twitter:title" content="' + title + '">' +
          '<meta name="twitter:description" content="' + description + '">';
        const page = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url).toString(), {
          method: "GET",
          headers: request.headers,
        }));
        if (!page.ok) throw new Error("ASSET_INDEX_UNAVAILABLE_" + page.status);
        const sourceHtml = await page.text();
        if (!sourceHtml || !/<!doctype html>/i.test(sourceHtml)) throw new Error("ASSET_INDEX_INVALID_HTML");
        const html = sourceHtml.replace("</head>", tags + "</head>");
        return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
      } catch (error) {
        console.error("Article SEO page failed:", error.message);
        return new Response("Page temporairement indisponible", { status: 503 });
      }
    }

    const publicArticleMatch = url.pathname.match(/^\/api\/articles\/([a-z0-9-]+)\/?$/i);
    if (publicArticleMatch && request.method === "GET") {
      try {
        const slug = decodeURIComponent(publicArticleMatch[1]);
        const result = await withDatabase(env, (db) => db.query(
          `SELECT id, title, slug, excerpt, content, cover_image_url, category, published_at
           FROM articles WHERE slug = $1 AND status = 'published' AND published_at <= NOW() LIMIT 1`,
          [slug]
        ));
        if (!result.rows.length) return json({ error: "ARTICLE_NOT_FOUND" }, 404, origin);
        return json({ article: result.rows[0] }, 200, origin);
      } catch (error) {
        console.error("Public article request failed:", error.message);
        return json({ error: "ARTICLE_UNAVAILABLE" }, 503, origin);
      }
    }

    if (url.pathname === "/api/site-content" && request.method === "GET") {
      try{return json({content:await publicSiteContent(env)},200,origin)}catch(error){console.error("Public site content unavailable:",error?.message||"unknown");return json({content:{claims:null,rights:null,section_order:null}},200,origin)}
    }
    if (url.pathname === "/api/survey/config" && request.method === "GET") {
      try{return json({config:await publicSurveyConfig(env)},200,origin)}catch(error){console.error("Public survey config unavailable:",error?.message||"unknown");return json({config:SURVEY_CONFIG_DEFAULT},200,origin)}
    }
    if (url.pathname === "/api/homepage" && request.method === "GET") {
      try {
        const result = await withDatabase(env, db => db.query("SELECT content FROM public.homepage_content WHERE id=1"));
        return json({ content: { ...HOMEPAGE_DEFAULTS, ...(result.rows[0]?.content || {}) } }, 200, origin);
      } catch (error) {
        console.error("Homepage content request failed:", error?.code || error?.name || "unknown");
        return json({ content: HOMEPAGE_DEFAULTS }, 200, origin);
      }
    }

    if (url.pathname === "/api/articles" && request.method === "GET") {
      try {
        const result = await withDatabase(env, (db) => db.query(
          `SELECT id, title, slug, excerpt, cover_image_url, category, published_at
           FROM articles WHERE status = 'published' AND published_at <= NOW()
           ORDER BY published_at DESC LIMIT 50`
        ));
        return json({ articles: result.rows }, 200, origin);
      } catch (error) {
        console.error("Articles request failed:", error.message);
        return json({ error: "ARTICLES_UNAVAILABLE" }, 503, origin);
      }
    }

    if (url.pathname === "/api/newsletter/subscribe" && request.method === "POST") return handleNewsletterSubscribe(request, env);

    if (url.pathname === "/api/contact" && request.method === "POST") return handleContact(request, env);

    if (url.pathname === "/api/survey" && request.method === "POST") return handleSurvey(request, env);

    if (url.pathname === "/api/admin/survey-results" && request.method === "GET") return surveyResults(request, env);

    if (url.pathname === "/admin/questionnaire" && request.method === "GET") {
      if (!await requireSurveyAdmin(request)) return new Response("Accès réservé à l’administrateur.", { status: 403 });
      return new Response(dashboardHtml(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
    }


    if(url.pathname==="/newsletter/desinscription"&&(request.method==="GET"||request.method==="POST")){
      const token=url.searchParams.get("token")||"";
      const validToken=/^[0-9a-f-]{36}$/i.test(token);
      const headers={"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
      if(request.method==="GET"){
        const message=validToken
          ? "Pour confirmer votre désinscription de la newsletter FO Free Distribution, cliquez sur le bouton ci-dessous."
          : "Ce lien de désinscription est invalide ou expiré.";
        const action=validToken
          ? '<form method="post" action="/newsletter/desinscription?token='+encodeURIComponent(token)+'"><input type="hidden" name="confirm" value="1"><button type="submit">Confirmer ma désinscription</button></form>'
          : "";
        return new Response('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Désinscription</title><body style="font:16px Arial;max-width:620px;margin:12vh auto;padding:24px"><h1>FO Free Distribution</h1><p>'+message+'</p>'+action+'<p><a href="https://fd.focom-iliad.fr/">Retour au site</a></p></body></html>',{headers});
      }
      if(!validToken) return new Response("Lien de désinscription invalide ou expiré.",{status:400,headers});
      const postBody=await request.text();
      const contentType=request.headers.get("content-type")||"";
      const oneClick=contentType.toLowerCase().includes("application/x-www-form-urlencoded")&&postBody==="List-Unsubscribe=One-Click";
      const manualConfirm=new URLSearchParams(postBody).get("confirm")==="1";
      if(!oneClick&&!manualConfirm)return new Response("Confirmation de désinscription invalide.",{status:400,headers});
      try{
        const r=await withDatabase(env,db=>db.query("UPDATE public.newsletter_subscribers SET status='unsubscribed',unsubscribed_at=NOW() WHERE unsubscribe_token=$1::uuid AND status='subscribed' RETURNING email",[token]));
        const message=r.rowCount?"Votre désinscription a bien été prise en compte.":"Cette adresse était déjà désinscrite ou le lien est expiré.";
        return new Response('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Désinscription confirmée</title><body style="font:16px Arial;max-width:620px;margin:12vh auto;padding:24px"><h1>FO Free Distribution</h1><p>'+message+'</p><a href="https://fd.focom-iliad.fr/">Retour au site</a></body></html>',{headers});
      }catch(e){
        console.error("Newsletter unsubscribe:",e?.code||e?.name||"unknown");
        return new Response("La désinscription n'a pas pu être enregistrée. Merci de réessayer.",{status:503,headers});
      }
    }

    if (url.pathname.startsWith("/api/admin/")) {
      try { return await handleAdmin(request, env, url, origin); }
      catch (error) {
        console.error("Admin API failed:", error?.name || "Error", error?.code || "NO_CODE", String(error?.message || "unknown").slice(0, 240));
        return json({ error: "ADMIN_API_UNAVAILABLE" }, 503, origin);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "NOT_FOUND" }, 404, origin);
    // Explicitly serve the SPA entry point for the admin route.
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url).toString(), { method: "GET", headers: request.headers }));
    }
    return env.ASSETS.fetch(request);
  },
};
