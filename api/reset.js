import { put } from "@vercel/blob";
import { requireAuth } from "./_auth.js";

export default async function handler(req, res){
  const sess = requireAuth(req, res);
  if(!sess) return;
  try{
    if(req.method !== "POST"){
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    const emptyState = { stores: [], meta: { lastGlobalRunAt: null, version: 0 } };
    const emptyHistory = { events: [] };

    await put("saldo/state.json", JSON.stringify(emptyState), {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true,
      addRandomSuffix: false,
      cacheControlMaxAge: 0
    });

    await put("saldo/history.json", JSON.stringify(emptyHistory), {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true,
      addRandomSuffix: false,
      cacheControlMaxAge: 0
    });

    res.status(200).json({ ok: true });
  } catch(e){
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
