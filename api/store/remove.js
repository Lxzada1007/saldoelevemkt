import { requireAuth } from "../_auth.js";
import { supabaseAdmin } from "../_supabase.js";

export default async function handler(req, res){
  try{
    const sess = requireAuth(req, res);
    if(!sess) return;

    if(req.method !== "POST"){
      res.setHeader("Allow","POST");
      res.status(405).json({ error:"Method Not Allowed" });
      return;
    }

    let body = req.body;
    if(typeof body === "string"){ try{ body = JSON.parse(body); } catch{ body = null; } }

    const storeId = String(body?.storeId || "").trim();
    const storeVersion = Number(body?.storeVersion ?? NaN);

    if(!storeId || !Number.isFinite(storeVersion)){
      res.status(400).json({ error:"Body inválido" });
      return;
    }

    const supabase = supabaseAdmin();

    const { data: current, error: cErr } = await supabase
      .from("stores").select("*").eq("id", storeId).single();
    if(cErr) throw cErr;

    if(Number(current.store_version) !== storeVersion){
      res.status(409).json({ error:"conflict", serverStore: {
        id: current.id, nome: current.nome, saldo: current.saldo, orcamentoDiario: current.orcamento_diario, ultimaExecucao: current.ultima_execucao, storeVersion: current.store_version
      }});
      return;
    }

    const { error: dErr } = await supabase
      .from("stores").delete().eq("id", storeId).eq("store_version", storeVersion);
    if(dErr) throw dErr;

    await supabase.from("history").insert({
      actor: sess.user,
      type: "store_removed",
      store_id: storeId,
      store_name: current.nome,
      payload: {}
    });

    res.status(200).json({ ok:true });
  } catch(e){
    console.error("API /api/store/remove error:", e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
