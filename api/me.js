import { readSession } from "./_auth.js";
export default async function handler(req, res){
  const sess = readSession(req);
  if(!sess){
    res.status(401).json({ ok:false });
    return;
  }
  res.status(200).json({ ok:true, user: sess.user });
}
