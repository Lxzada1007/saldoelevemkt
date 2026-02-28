import { supabaseAdmin } from "../_supabase.js";

export default async function handler(req, res){
  try{
    const secret = process.env.CRON_SECRET;
    if(secret){
      const got = req.headers["x-cron-secret"];
      if(got !== secret){
        res.status(401).json({ ok:false, error:"unauthorized" });
        return;
      }
    }

    const supabase = supabaseAdmin();
    const { error } = await supabase.rpc("debit_daily", { p_actor: "cron" });
    if(error) throw error;

    res.status(200).json({ ok:true });
  } catch(e){
    console.error("API /api/cron/daily error:", e);
    res.status(500).json({ ok:false, error: String(e?.message ?? e) });
  }
}
