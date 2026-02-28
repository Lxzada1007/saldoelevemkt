import crypto from "crypto";

const USERS = {
  "Lucas": "admin",
  "Mateus": "admin"
};

const COOKIE_NAME = "saldo_session";
const SIGN_SECRET = process.env.AUTH_SECRET || "change-me-in-vercel";

function b64url(buf){
  return Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function sign(data){
  return b64url(crypto.createHmac("sha256", SIGN_SECRET).update(data).digest());
}

export function makeSessionToken(user){
  const payload = JSON.stringify({ user, iat: Date.now() });
  const p = b64url(payload);
  const s = sign(p);
  return `${p}.${s}`;
}

export function readSession(req){
  const cookie = req.headers.cookie || "";
  const m = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if(!m) return null;
  const token = decodeURIComponent(m[1]);
  const parts = token.split(".");
  if(parts.length !== 2) return null;
  const [p,sig] = parts;
  if(sign(p) !== sig) return null;
  try{
    const json = Buffer.from(p.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf-8");
    const obj = JSON.parse(json);
    if(!obj?.user) return null;
    return { user: obj.user };
  } catch { return null; }
}

export function requireAuth(req, res){
  const sess = readSession(req);
  if(!sess || !USERS[sess.user]){
    res.status(401).json({ ok:false, error:"unauthorized" });
    return null;
  }
  return sess;
}

export function validateLogin(user, pass){
  const expected = USERS[user];
  if(!expected) return false;
  return String(pass) === String(expected);
}

export function setSessionCookie(res, token, remember){
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure"
  ];
  if(remember){
    // 30 days
    attrs.push(`Max-Age=${30*24*60*60}`);
  }
  res.setHeader("Set-Cookie", attrs.join("; "));
}

export function clearSessionCookie(res){
  const attrs = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    "Max-Age=0"
  ];
  res.setHeader("Set-Cookie", attrs.join("; "));
}
