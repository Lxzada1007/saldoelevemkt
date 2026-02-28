import { requireAuth } from "./_auth.js";
import { supabaseAdmin } from "./_supabase.js";

export default async function handler(req, res){
  try{
    const sess = requireAuth(req, res);
    if(!sess) return;

    if(req.method !== "POST"){
      res.setHeader("Allow","POST");
      res.status(405).json({ error:"Method Not Allowed" });
      return;
    }

    const supabase = supabaseAdmin();

    // limpa dados
    const { error: e1 } = await supabase.from("stores").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if(e1) throw e1;

    const { error: e2 } = await supabase.from("history").delete().neq("id", -1);
    if(e2) throw e2;

    const { error: e3 } = await supabase.from("meta").update({ last_global_run_at: null }).eq("id", 1);
    if(e3) throw e3;

    await supabase.from("history").insert({ actor: sess.user, type:"reset", payload:{} });

    res.status(200).json({ ok:true });
  } catch(e){
    console.error("API /api/reset error:", e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
