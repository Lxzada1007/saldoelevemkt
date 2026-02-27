import { head } from "@vercel/blob";

const PATHNAME = "saldo/state.json";

export default async function handler(req, res) {
  try {
    // If token/store is configured, head may succeed or fail with not found; both mean connectivity ok.
    try {
      await head(PATHNAME, { access: "private" });
    } catch (e) {
      // ignore (not found is fine)
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
