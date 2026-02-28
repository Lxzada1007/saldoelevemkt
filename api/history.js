import { requireAuth } from "./_auth.js";
import { supabaseAdmin } from "./_supabase.js";

export default async function handler(req, res){
  try{
    const sess = requireAuth(req, res);
    if(!sess) return;

    const supabase = supabaseAdmin();

    const limit = Math.min(1000, Math.max(50, Number(req.query?.limit ?? 500)));
    const { data, error } = await supabase
      .from("history")
      .select("*")
      .order("ts", { ascending: false })
      .limit(limit);

    if(error) throw error;

    res.status(200).json({ events: data || [] });
  } catch(e){
    console.error("API /api/history error:", e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
