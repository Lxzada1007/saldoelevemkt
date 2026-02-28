import { put, head } from "@vercel/blob";

const PATHNAME = "saldo/state.json";

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

function applyUpdate(state, storeId, field, value){
  const idx = state.stores.findIndex(s => s.id === storeId);
  if(idx === -1) return { ok:false, error:"Loja não encontrada" };
  const s = state.stores[idx];

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
  return { ok:true, store: s };
}

export default async function handler(req, res){
  try{
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

    res.status(200).json({ ok:true, version: state.meta.version, store: applied.store });
  } catch(e){
    console.error("API /api/store/update error:", e);
    res.status(500).json({ error:String(e?.message ?? e) });
  }
}
