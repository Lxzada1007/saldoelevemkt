export default async function handler(req, res){
  const ok = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  res.status(200).json({ ok, provider: "supabase" });
}
