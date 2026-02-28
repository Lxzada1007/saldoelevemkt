import { put, head } from "@vercel/blob";
import { requireAuth } from "../_auth.js";

const PATHNAME = "saldo/state.json";
const HISTORY_PATH = "saldo/history.json";

function defaultState(){ return { stores: [], meta: { lastGlobalRunAt: null, version: 0 } }; }

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

async function readState(){
  try{
    const meta = await head(PATHNAME);
    const resp = await fetch(meta.url, { cache: "no-store" });
    if(!resp.ok) throw new Error(`fetch blob ${resp.status}`);
    return normalizeState(await resp.json());
  } catch(e){
    return defaultState();
  }
}

async function readHistory(){
  try{
    const meta = await head(HISTORY_PATH);
    const resp = await fetch(meta.url, { cache:"no-store" });
    if(!resp.ok) throw new Error("fetch");
    const data = await resp.json();
    if(!data || typeof data !== "object" || !Array.isArray(data.events)) return { events: [] };
    return data;
  } catch { return { events: [] }; }
}
function newEvent(type, actor, payload){
  return { id: Math.random().toString(16).slice(2) + "-" + Date.now(), type, actor, ts: new Date().toISOString(), payload };
}
async function appendEvent(ev){
  const h = await readHistory();
  h.events.push(ev);
  if(h.events.length > 5000) h.events = h.events.slice(h.events.length - 5000);
  await put(HISTORY_PATH, JSON.stringify(h), { access:"public", contentType:"application/json", allowOverwrite:true, addRandomSuffix:false, cacheControlMaxAge:0 });
}

function applyUpdate(state, storeId, field, value){
  const idx = state.stores.findIndex(s => s.id === storeId);
  if(idx === -1) return { ok:false, error:"Loja não encontrada" };
  const s = state.stores[idx];

  const before = (field === "saldo") ? s.saldo : s.orcamentoDiario;

  if(field === "saldo"){
    if(value === null || value === undefined){
      s.saldo = null;
    } else {
      const n = Number(value);
      if(!Number.isFinite(n) || n < 0) return { ok:false, error:"Saldo inválido" };
      s.saldo = Number(n.toFixed(2));
    }
  } else if(field === "orcamentoDiario"){
    const n = Number(value);
    if(!Number.isFinite(n) || n < 0) return { ok:false, error:"Orçamento inválido" };
    s.orcamentoDiario = Number(n.toFixed(2));
  } else {
    return { ok:false, error:"Campo inválido" };
  }

  const after = (field === "saldo") ? s.saldo : s.orcamentoDiario;
  return { ok:true, store: s, before, after };
}

export default async function handler(req, res){
  try{
    const sess = requireAuth(req, res);
    if(!sess) return;

    if(req.method !== "POST"){
      res.setHeader("Allow","POST");
      res.status(405).json({ error:"Method Not Allowed" });
      return;
    }

    let body = req.body;
    if(typeof body === "string"){ try{ body = JSON.parse(body); } catch{ body = null; } }
    const storeId = String(body?.storeId || "").trim();
    const field = String(body?.field || "").trim();
    const value = body?.value;

    if(!storeId || !field){
      res.status(400).json({ error:"Body inválido" });
      return;
    }

    const baseHeader = req.headers["x-base-version"] || req.headers["X-Base-Version"];
    const baseVersion = (baseHeader === undefined) ? null : Number(baseHeader);

    const state = await readState();
    const currentV = Number(state?.meta?.version) || 0;

    if(baseVersion !== null && Number.isFinite(baseVersion) && baseVersion !== currentV){
      res.status(409).json({ error:"conflict", serverVersion: currentV });
      return;
    }

    const applied = applyUpdate(state, storeId, field, value);
    if(!applied.ok){
      res.status(400).json(applied);
      return;
    }

    state.meta.version = currentV + 1;

    await put(PATHNAME, JSON.stringify(state), {
      access:"public",
      contentType:"application/json",
      allowOverwrite:true,
      addRandomSuffix:false,
      cacheControlMaxAge:0
    });

    // history
    const type = (field === "saldo") ? "saldo_change" : "budget_change";
    await appendEvent(newEvent(type, sess.user, {
      storeId, storeName: applied.store.nome,
      from: applied.before, to: applied.after,
      source: "patch"
    }));

    res.status(200).json({ ok:true, version: state.meta.version, store: applied.store });
  } catch(e){
    console.error("API /api/store/update error:", e);
    res.status(500).json({ error:String(e?.message ?? e) });
  }
}
