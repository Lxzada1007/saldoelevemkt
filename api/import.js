import { put, head } from "@vercel/blob";
import { requireAuth } from "./_auth.js";

const PATHNAME = "saldo/state.json";
const HISTORY_PATH = "saldo/history.json";

function defaultState(){ return { stores: [], meta: { lastGlobalRunAt: null, version: 0 } }; }

function normalizeState(st){
  const out = defaultState();
  if(st && typeof st === "object"){
    out.meta.lastGlobalRunAt = st?.meta?.lastGlobalRunAt ?? null;
    out.meta.version = Number.isFinite(Number(st?.meta?.version)) ? Number(st.meta.version) : 0;
    out.stores = Array.isArray(st.stores) ? st.stores : [];
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

function slugId(name){
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || ("loja-" + Math.random().toString(16).slice(2));
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
    const items = Array.isArray(body?.items) ? body.items : [];
    if(items.length === 0){
      res.status(400).json({ error:"Sem itens" });
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

    const byName = new Map(state.stores.map(s => [String(s?.nome||"").toLowerCase(), s]));
    let created = 0, updated = 0;

    for(const it of items){
      const nome = String(it?.nome || "").trim();
      if(!nome) continue;
      const key = nome.toLowerCase();
      const saldo = (it?.saldo === null || it?.saldo === undefined) ? null : Number(it.saldo);

      const ex = byName.get(key);
      if(ex){
        ex.saldo = Number.isFinite(saldo) ? Number(saldo.toFixed(2)) : null;
        ex.ativa = true;
        updated++;
      } else {
        const s = {
          id: slugId(nome),
          nome,
          saldo: Number.isFinite(saldo) ? Number(saldo.toFixed(2)) : null,
          orcamentoDiario: 0,
          ultimaExecucao: null,
          ativa: true
        };
        state.stores.push(s);
        byName.set(key, s);
        created++;
      }
    }

    state.meta.version = currentV + 1;

    await put(PATHNAME, JSON.stringify(state), {
      access:"public",
      contentType:"application/json",
      allowOverwrite:true,
      addRandomSuffix:false,
      cacheControlMaxAge:0
    });

    await appendEvent(newEvent("import", sess.user, { created, updated, totalLines: items.length }));

    res.status(200).json({ ok:true, version: state.meta.version, created, updated });
  } catch(e){
    console.error("API /api/import error:", e);
    res.status(500).json({ error:String(e?.message ?? e) });
  }
}
