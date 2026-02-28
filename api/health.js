import { head } from "@vercel/blob";

export default async function handler(req, res) {
  try{
    // If token exists, SDK loads it; head might 404 if not created yet, which is fine.
    try{ await head("saldo/state.json"); } catch(e){}
    res.status(200).json({ ok: true });
  } catch(e){
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
