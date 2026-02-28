import { validateLogin, makeSessionToken, setSessionCookie } from "./_auth.js";

export default async function handler(req, res){
  try{
    if(req.method !== "POST"){
      res.setHeader("Allow","POST");
      res.status(405).json({ ok:false });
      return;
    }
    let body = req.body;
    if(typeof body === "string"){ try{ body = JSON.parse(body); } catch{ body = null; } }

    const user = String(body?.user || "").trim();
    const pass = String(body?.pass || "");
    const remember = !!body?.remember;

    if(!validateLogin(user, pass)){
      res.status(401).json({ ok:false });
      return;
    }

    const token = makeSessionToken(user);
    setSessionCookie(res, token, remember);
    res.status(200).json({ ok:true, user });
  } catch(e){
    res.status(500).json({ ok:false, error:String(e?.message ?? e) });
  }
}
