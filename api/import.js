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

    let body = req.body;
    if(typeof body === "string"){ try{ body = JSON.parse(body); } catch{ body = null; } }
    const items = Array.isArray(body?.items) ? body.items : [];
    if(items.length === 0){
      res.status(400).json({ error:"Sem itens" });
      return;
    }

    const supabase = supabaseAdmin();

    // Upsert por nome: atualiza saldo, mantém orçamento_diario
    let created = 0, updated = 0;

    for(const it of items){
      const nome = String(it?.nome || "").trim();
      if(!nome) continue;
      const saldo = (it?.saldo === null || it?.saldo === undefined) ? null : Number(it.saldo);
      const saldoVal = Number.isFinite(saldo) ? Number(saldo.toFixed(2)) : null;

      // tenta update
      const { data: existing, error: eErr } = await supabase
        .from("stores").select("id,store_version,orcamento_diario,nome,saldo").eq("nome", nome).maybeSingle();
      if(eErr) throw eErr;

      if(existing){
        const { error: uErr } = await supabase
          .from("stores")
          .update({ saldo: saldoVal, store_version: Number(existing.store_version)+1 })
          .eq("id", existing.id);
        if(uErr) throw uErr;
        updated++;
      } else {
        const { error: iErr } = await supabase
          .from("stores")
          .insert({ nome, saldo: saldoVal, orcamento_diario: 0 });
        if(iErr) throw iErr;
        created++;
      }
    }

    await supabase.from("history").insert({
      actor: sess.user,
      type: "import",
      payload: { created, updated, totalLines: items.length }
    });

    res.status(200).json({ ok:true, created, updated });
  } catch(e){
    console.error("API /api/import error:", e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
