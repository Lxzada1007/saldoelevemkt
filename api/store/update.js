import { requireAuth } from "../_auth.js";
import { supabaseAdmin } from "../_supabase.js";

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

    if(req.method !== "POST"){
      res.setHeader("Allow","POST");
      res.status(405).json({ error:"Method Not Allowed" });
      return;
    }

    let body = req.body;
    if(typeof body === "string"){ try{ body = JSON.parse(body); } catch{ body = null; } }

    const storeId = String(body?.storeId || "").trim();
    const field = String(body?.field || "").trim();
    const value = body?.value;
    const storeVersion = Number(body?.storeVersion ?? NaN);

    if(!storeId || !field || !Number.isFinite(storeVersion)){
      res.status(400).json({ error:"Body inválido" });
      return;
    }

    const supabase = supabaseAdmin();

    // Carrega estado atual da loja para log e conflito
    const { data: current, error: cErr } = await supabase
      .from("stores")
      .select("*")
      .eq("id", storeId)
      .single();
    if(cErr) throw cErr;

    if(Number(current.store_version) !== storeVersion){
      res.status(409).json({ error:"conflict", serverStore: mapStore(current) });
      return;
    }

    let patch = { store_version: storeVersion + 1 };
    let type = "";
    let payload = { from: null, to: null };

    if(field === "saldo"){
      type = "saldo_change";
      payload.from = current.saldo === null ? null : Number(current.saldo);
      if(value === null || value === undefined || value === ""){
        patch.saldo = null;
        payload.to = null;
      } else {
        const n = Number(value);
        if(!Number.isFinite(n) || n < 0){
          res.status(400).json({ error:"Saldo inválido" });
          return;
        }
        patch.saldo = Number(n.toFixed(2));
        payload.to = patch.saldo;
      }
    } else if(field === "orcamentoDiario"){
      type = "budget_change";
      payload.from = Number(current.orcamento_diario ?? 0);
      const n = Number(value);
      if(!Number.isFinite(n) || n < 0){
        res.status(400).json({ error:"Orçamento inválido" });
        return;
      }
      patch.orcamento_diario = Number(n.toFixed(2));
      payload.to = patch.orcamento_diario;
    } else {
      res.status(400).json({ error:"Campo inválido" });
      return;
    }

    const { data: updated, error: uErr } = await supabase
      .from("stores")
      .update(patch)
      .eq("id", storeId)
      .eq("store_version", storeVersion)
      .select("*")
      .single();

    if(uErr) throw uErr;
    if(!updated){
      // alguém atualizou entre o select e o update
      const { data: nowRow } = await supabase.from("stores").select("*").eq("id", storeId).single();
      res.status(409).json({ error:"conflict", serverStore: nowRow ? mapStore(nowRow) : null });
      return;
    }
    try{
      await supabase.from("history").insert({
      actor: sess.user,
      type,
      store_id: storeId,
      store_name: updated.nome,
      payload
    });
    } catch(e){
      console.warn("history insert failed:", e);
      // Não falha a operação principal
    }

    res.status(200).json({ ok:true, store: mapStore(updated) });
  } catch(e){
    console.error("API /api/store/update error:", e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
