import { put } from "@vercel/blob";

const PATHNAME = "saldo/state.json";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    const st = { stores: [], meta: { lastGlobalRunAt: null } };
    await put(PATHNAME, JSON.stringify(st), {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true,
      cacheControlMaxAge: 0
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
