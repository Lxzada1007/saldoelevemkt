import { put, head } from "@vercel/blob";

const PATHNAME = "saldo/state.json";

function defaultState() {
  return { stores: [], meta: { lastGlobalRunAt: null } };
}

function normalizeState(st) {
  const out = defaultState();
  if (st && typeof st === "object") {
    if (st.meta && typeof st.meta === "object") out.meta.lastGlobalRunAt = st.meta.lastGlobalRunAt ?? null;
    if (Array.isArray(st.stores)) {
      out.stores = st.stores.map((s) => ({
        id: String(s?.id ?? "").trim() || String(s?.nome ?? "").toLowerCase().replace(/\s+/g, "-").slice(0, 60),
        nome: String(s?.nome ?? "").trim(),
        saldo: (s?.saldo === null || s?.saldo === undefined) ? null : Number(s.saldo),
        orcamentoDiario: Number(s?.orcamentoDiario ?? 0),
        ultimaExecucao: s?.ultimaExecucao ? String(s.ultimaExecucao) : null,
        ativa: s?.ativa === false ? false : true
      })).filter(s => s.nome);
      out.stores = out.stores.map(s => ({
        ...s,
        saldo: Number.isFinite(s.saldo) ? s.saldo : null,
        orcamentoDiario: (Number.isFinite(s.orcamentoDiario) && s.orcamentoDiario >= 0) ? s.orcamentoDiario : 0
      }));
    }
  }
  return out;
}

async function readStateFromBlob() {
  try {
    // For PUBLIC blobs we can fetch directly by URL.
    const meta = await head(PATHNAME);
    const resp = await fetch(meta.url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`fetch blob ${resp.status}`);
    const st = await resp.json();
    return normalizeState(st);
  } catch (e) {
    // If blob doesn't exist yet, return default
    return defaultState();
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const st = await readStateFromBlob();
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(st);
      return;
    }

    if (req.method === "PUT") {
      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Body inválido" });
        return;
      }
      const st = normalizeState(body);
      const jsonString = JSON.stringify(st);

      // IMPORTANT:
      // - Using PUBLIC access simplifies reads (no SDK get needed, no auth header).
      // - We overwrite the same pathname.
      await put(PATHNAME, jsonString, {
        access: "public",
        contentType: "application/json",
        allowOverwrite: true,
        cacheControlMaxAge: 0
      });

      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET,PUT");
    res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("API /api/state error:", e);
    res.status(500).json({ error: "Falha na API", detail: String(e?.message ?? e) });
  }
}
