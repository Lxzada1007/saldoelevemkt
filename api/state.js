import { put, head } from "@vercel/blob";

const PATHNAME = "saldo/state.json";

function defaultState(){
  return { stores: [], meta: { lastGlobalRunAt: null } };
}

function normalizeState(st){
  const out = defaultState();
  if(st && typeof st === "object"){
    out.meta.lastGlobalRunAt = st?.meta?.lastGlobalRunAt ?? null;
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

export default async function handler(req, res){
  try{
    if(req.method === "GET"){
      const st = await readState();
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(st);
      return;
    }

    if(req.method === "PUT"){
      let body = req.body;
      if(typeof body === "string"){
        try{ body = JSON.parse(body); } catch(e){ body = null; }
      }
      if(!body || typeof body !== "object"){
        res.status(400).json({ error: "Body inválido" });
        return;
      }
      const st = normalizeState(body);
      await put(PATHNAME, JSON.stringify(st), {
        access: "public",
        contentType: "application/json",
        allowOverwrite: true,
        addRandomSuffix: false,
        cacheControlMaxAge: 0
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET,PUT");
    res.status(405).json({ error: "Method Not Allowed" });
  } catch(e){
    console.error("API /api/state error:", e);
    res.status(500).json({ error: "Falha na API", detail: String(e?.message ?? e) });
  }
}
