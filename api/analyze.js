// Vercel serverless function — proxies requests to Anthropic API
// Environment variable required: ANTHROPIC_API_KEY (set in Vercel dashboard)

export default async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY not set. Go to Vercel project Settings → Environment Variables, add it, then redeploy."
    });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: "Anthropic returned non-JSON: " + text.slice(0, 200) });
    }

    return res.status(upstream.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: "Proxy fetch failed: " + err.message });
  }
}
