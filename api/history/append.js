import { put, head } from "@vercel/blob";

const PATHNAME = "saldo/history.json";
const MAX_EVENTS = 5000;

function defaultHistory(){
  return { events: [] };
}

async function readHistory(){
  try{
    const meta = await head(PATHNAME);
    const resp = await fetch(meta.url, { cache: "no-store" });
    if(!resp.ok) throw new Error(`fetch blob ${resp.status}`);
    const data = await resp.json();
    if(!data || typeof data !== "object" || !Array.isArray(data.events)) return defaultHistory();
    return data;
  } catch(e){
    return defaultHistory();
  }
}

export default async function handler(req, res){
  try{
    if(req.method !== "POST"){
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    let body = req.body;
    if(typeof body === "string"){
      try{ body = JSON.parse(body); } catch(e){ body = null; }
    }
    if(!body || typeof body !== "object"){
      res.status(400).json({ error: "Body inválido" });
      return;
    }

    const ev = {
      id: String(body.id || Math.random().toString(16).slice(2) + "-" + Date.now()),
      type: String(body.type || "event"),
      ts: String(body.ts || new Date().toISOString()),
      payload: body.payload || {}
    };

    const h = await readHistory();
    h.events.push(ev);

    // keep last MAX_EVENTS
    if(h.events.length > MAX_EVENTS){
      h.events = h.events.slice(h.events.length - MAX_EVENTS);
    }

    await put(PATHNAME, JSON.stringify(h), {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true,
      addRandomSuffix: false,
      cacheControlMaxAge: 0
    });

    res.status(200).json({ ok: true });
  } catch(e){
    console.error("API /api/history/append error:", e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
