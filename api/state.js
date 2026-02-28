import { put, head } from "@vercel/blob";

const PATHNAME = "saldo/state.json";

function defaultState(){
  return { stores: [], meta: { lastGlobalRunAt: null, version: 0 } };
}

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

      // Optimistic locking: evita sobrescrever quando outra aba/usuário salvou antes
      const baseHeader = req.headers["x-base-version"] || req.headers["X-Base-Version"]; 
      if(baseHeader !== undefined && baseHeader !== null){
        const baseVersion = Number(baseHeader);
        const current = await readState();
        const currentV = Number(current?.meta?.version) || 0;
        if(Number.isFinite(baseVersion) && baseVersion !== currentV){
          res.status(409).json({ error: "conflict", serverVersion: currentV });
          return;
        }
      }

      // bump version on each successful write
      const current2 = await readState();
      const currentV2 = Number(current2?.meta?.version) || 0;
      st.meta.version = currentV2 + 1;

      await put(PATHNAME, JSON.stringify(st), {
        access: "public",
        contentType: "application/json",
        allowOverwrite: true,
        addRandomSuffix: false,
        cacheControlMaxAge: 0
      });
      res.status(200).json({ ok: true, version: st.meta.version });
      return;
    }

    res.setHeader("Allow", "GET,PUT");
    res.status(405).json({ error: "Method Not Allowed" });
  } catch(e){
    console.error("API /api/state error:", e);
    res.status(500).json({ error: "Falha na API", detail: String(e?.message ?? e) });
  }
}
