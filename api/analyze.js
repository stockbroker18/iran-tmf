// Vercel serverless function — proxies requests to Google Gemini API (free tier)
// Environment variable required: GEMINI_API_KEY
// Get a free key at: https://aistudio.google.com/app/apikey (no credit card needed)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY not set. Go to Vercel project Settings → Environment Variables, add it, then redeploy. Get a free key at aistudio.google.com/app/apikey"
    });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }

  const userMessage = body.messages?.find(m => m.role === "user")?.content || "";

  const geminiBody = {
    contents: [{ parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
    }
  };

  try {
    const model = "gemini-2.0-flash"; // free tier, no daily cap issues
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: "Gemini returned non-JSON: " + text.slice(0, 300) });
    }

    if (!upstream.ok) {
      const msg = data?.error?.message || "Gemini API error";
      return res.status(upstream.status).json({ error: msg });
    }

    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!responseText) {
      const reason = data?.candidates?.[0]?.finishReason || "unknown";
      return res.status(500).json({ error: `Gemini returned empty response. Finish reason: ${reason}` });
    }

    return res.status(200).json({
      content: [{ type: "text", text: responseText }]
    });

  } catch (err) {
    return res.status(500).json({ error: "Proxy fetch failed: " + err.message });
  }
}
