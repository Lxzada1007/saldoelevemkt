import { requireAuth } from "./_auth.js";
import { supabaseAdmin } from "./_supabase.js";

function mapStore(row){
  return {
    id: row.id,
    nome: row.nome,
    saldo: row.saldo === null ? null : Number(row.saldo),
    orcamentoDiario: Number(row.orcamento_diario ?? 0),
    ultimaExecucao: row.ultima_execucao,
    storeVersion: Number(row.store_version ?? 0)
  };
}

export default async function handler(req, res){
  try{
    const sess = requireAuth(req, res);
    if(!sess) return;

    const supabase = supabaseAdmin();

    if(req.method === "GET"){
      const { data: stores, error } = await supabase
        .from("stores")
        .select("*")
        .order("nome", { ascending: true });

      if(error) throw error;

      const { data: meta, error: mErr } = await supabase
        .from("meta").select("*").eq("id", 1).single();
      if(mErr) throw mErr;

      res.status(200).json({
        stores: (stores || []).map(mapStore),
        meta: {
          lastGlobalRunAt: meta?.last_global_run_at ?? null
        }
      });
      return;
    }

    res.setHeader("Allow","GET");
    res.status(405).json({ error:"Method Not Allowed" });
  } catch(e){
    console.error("API /api/state error:", e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
