import { clearSessionCookie } from "./_auth.js";
export default async function handler(req, res){
  if(req.method !== "POST"){
    res.setHeader("Allow","POST");
    res.status(405).json({ ok:false });
    return;
  }
  clearSessionCookie(res);
  res.status(200).json({ ok:true });
}
