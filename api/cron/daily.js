import { put, head } from "@vercel/blob";

const STATE_PATH = "saldo/state.json";
const HISTORY_PATH = "saldo/history.json";
const MAX_EVENTS = 5000;

// Optional secret (recommended): set CRON_SECRET in Vercel env and send header x-cron-secret
function checkSecret(req){
  const secret = process.env.CRON_SECRET;
  if(!secret) return true;
  const got = req.headers["x-cron-secret"] || req.headers["X-Cron-Secret"];
  return got === secret;
}

function defaultState(){ return { stores: [], meta: { lastGlobalRunAt: null, version: 0 } }; }
function defaultHistory(){ return { events: [] }; }

function normalizeState(st){
  const out = defaultState();
  if(st && typeof st === "object"){
    out.meta.lastGlobalRunAt = st?.meta?.lastGlobalRunAt ?? null;
    out.meta.version = Number.isFinite(Number(st?.meta?.version)) ? Number(st.meta.version) : 0;
    if(Array.isArray(st.stores)){
      out.stores = st.stores.map(s => ({
        id: String(s?.id ?? "").trim() || String(s?.nome ?? "").toLowerCase().replace(/\s+/g,"-").slice(0,60),
        nome: String(s?.nome ?? "").trim(),
        saldo: (s?.saldo === null || s?.saldo === undefined) ? null : Number(s.saldo),
        orcamentoDiario: Number(s?.orcamentoDiario ?? 0),
        ultimaExecucao: s?.ultimaExecucao ? String(s.ultimaExecucao) : null,
        ativa: s?.ativa === false ? false : true
      })).filter(s => s.nome).map(s => ({
        ...s,
        saldo: Number.isFinite(s.saldo) ? s.saldo : null,
        orcamentoDiario: (Number.isFinite(s.orcamentoDiario) && s.orcamentoDiario >= 0) ? s.orcamentoDiario : 0
      }));
    }
  }
  return out;
}

async function readJson(pathname, fallback){
  try{
    const meta = await head(pathname);
    const resp = await fetch(meta.url, { cache: "no-store" });
    if(!resp.ok) throw new Error(`fetch ${resp.status}`);
    return await resp.json();
  } catch(e){
    return fallback;
  }
}

function dateKeyInTZ(date, timeZone){
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const y = parts.find(p=>p.type==="year")?.value;
  const m = parts.find(p=>p.type==="month")?.value;
  const d = parts.find(p=>p.type==="day")?.value;
  return `${y}-${m}-${d}`;
}

function newEvent(type, payload){
  return {
    id: Math.random().toString(16).slice(2) + "-" + Date.now(),
    type,
    ts: new Date().toISOString(),
    payload
  };
}

export default async function handler(req, res){
  try{
    if(req.method !== "GET" && req.method !== "POST"){
      res.setHeader("Allow", "GET,POST");
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    if(!checkSecret(req)){
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const tz = process.env.CRON_TZ || "America/Sao_Paulo";
    const now = new Date();
    const todayKey = dateKeyInTZ(now, tz);

    const rawState = await readJson(STATE_PATH, defaultState());
    const state = normalizeState(rawState);

    const rawHistory = await readJson(HISTORY_PATH, defaultHistory());
    const history = (rawHistory && Array.isArray(rawHistory.events)) ? rawHistory : defaultHistory();

    let changed = 0;

    for(const s of state.stores){
      if(s.ativa === false) continue;
      if(s.saldo === null) continue;
      if(s.ultimaExecucao === todayKey) continue;

      const budget = Number(s.orcamentoDiario) || 0;
      const before = s.saldo;

      if(budget <= 0){
        s.ultimaExecucao = todayKey;
        continue;
      }

      if(before >= budget){
        s.saldo = Number((before - budget).toFixed(2));
      } else {
        s.saldo = null;
      }
      s.ultimaExecucao = todayKey;
      changed++;

      history.events.push(newEvent("debit", {
        dateKey: todayKey,
        storeId: s.id,
        storeName: s.nome,
        budget,
        before,
        after: s.saldo,
        result: (s.saldo === null) ? "SEM SALDO" : "OK"
      }));
    }

    if(changed > 0){
      state.meta.lastGlobalRunAt = now.toISOString();
      state.meta.version = (Number(state.meta.version)||0) + 1;
      await put(STATE_PATH, JSON.stringify(state), {
        access: "public",
        contentType: "application/json",
        allowOverwrite: true,
        addRandomSuffix: false,
        cacheControlMaxAge: 0
      });
    }

    // Always persist history if we appended
    if(history.events.length > MAX_EVENTS){
      history.events = history.events.slice(history.events.length - MAX_EVENTS);
    }
    if(changed > 0){
      await put(HISTORY_PATH, JSON.stringify(history), {
        access: "public",
        contentType: "application/json",
        allowOverwrite: true,
        addRandomSuffix: false,
        cacheControlMaxAge: 0
      });
    }

    res.status(200).json({ ok: true, dateKey: todayKey, changed });
  } catch(e){
    console.error("API /api/cron/daily error:", e);
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
