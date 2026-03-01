// Vercel serverless function — proxies requests to Anthropic API
// This runs on the server, so CORS and API key exposure are not an issue.
// Environment variable required: ANTHROPIC_API_KEY (set in Vercel dashboard)

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY environment variable not set. Add it in Vercel → Settings → Environment Variables." });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":         "application/json",
        "x-api-key":            apiKey,
        "anthropic-version":    "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    // Pass through any API errors with their status code
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Allow the browser to call this endpoint
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: `Proxy error: ${err.message}` });
  }
}
