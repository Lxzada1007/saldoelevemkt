import { head } from "@vercel/blob";

const PATHNAME = "saldo/state.json";

export default async function handler(req, res) {
  try {
    try {
      await head(PATHNAME);
    } catch (e) {
      // not found is fine
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
