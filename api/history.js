import { put, head } from "@vercel/blob";

const PATHNAME = "saldo/history.json";

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
    if(req.method !== "GET"){
      res.setHeader("Allow", "GET");
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    const h = await readHistory();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(h);
  } catch(e){
    console.error("API /api/history error:", e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
