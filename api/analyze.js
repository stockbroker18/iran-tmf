// Vercel serverless function — proxies requests to Groq API (free tier)
// Get a free key at: https://console.groq.com (no credit card needed)
// Free tier: 14,400 requests/day, 30 requests/minute — more than enough

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GROQ_API_KEY not set. Get a free key at console.groq.com then add it in Vercel → Settings → Environment Variables."
    });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }

  // Groq uses OpenAI-compatible format — just swap the model name
  const groqBody = {
    model: "llama-3.3-70b-versatile", // best free model on Groq, 32k context
    messages: body.messages || [],
    temperature: 0.2,
    max_tokens: 4000,
  };

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(groqBody),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: "Groq returned non-JSON: " + text.slice(0, 300) });
    }

    if (!upstream.ok) {
      const msg = data?.error?.message || "Groq API error";
      return res.status(upstream.status).json({ error: msg });
    }

    // Convert Groq/OpenAI response format to Anthropic-style format that App.js expects
    const responseText = data?.choices?.[0]?.message?.content || "";
    if (!responseText) {
      return res.status(500).json({ error: "Groq returned empty response" });
    }

    return res.status(200).json({
      content: [{ type: "text", text: responseText }]
    });

  } catch (err) {
    return res.status(500).json({ error: "Proxy fetch failed: " + err.message });
  }
}
