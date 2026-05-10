const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/ask", async (req, res) => {
  const { apiKey, endpoint, model, question, context = [] } = req.body;
  if (!apiKey) return res.status(400).json({ error: "Missing apiKey" });
  if (!question) return res.status(400).json({ error: "Missing question" });

  // Build messages from ancestor chain
  const messages = [];
  context.forEach(({ question: q, answer: a }) => {
    messages.push({ role: "user", content: q });
    if (a) messages.push({ role: "assistant", content: a });
  });
  messages.push({ role: "user", content: question });

  const system =
    "You are a knowledgeable tutor helping someone build a idea map. " +
    "The conversation history shows the chain of questions from root to parent. " +
    "Answer the current question clearly and concisely (3-6 sentences). " +
    "Stay focused on the specific question, using context to be precise. " +
    "Do not use markdown headers or bullet formatting — plain prose only.";

  try {
    // Support custom endpoint (OpenAI-compatible) or default Anthropic
    const useCustomEndpoint = endpoint && endpoint.trim() !== "" && !endpoint.includes("anthropic.com");

    if (useCustomEndpoint) {
      // OpenAI-compatible path (Ollama, OpenAI, etc.)
      const targetUrl = endpoint.trim();
      const oaiRes = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || "gpt-4o",
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: 1024,
        }),
      });
      const oaiData = await oaiRes.json();
      if (!oaiRes.ok) throw new Error(oaiData.error?.message || "Upstream API error");
      const answer = oaiData.choices?.[0]?.message?.content || "";
      return res.json({ answer });
    }

    // Anthropic SDK path
    const clientOpts = { apiKey };
    if (endpoint && endpoint.trim()) clientOpts.baseURL = endpoint.trim();
    const client = new Anthropic(clientOpts);

    const response = await client.messages.create({
      model: model || "claude-sonnet-4-5",
      max_tokens: 1024,
      system,
      messages,
    });

    const answer = response.content.map((c) => c.text || "").join("");
    res.json({ answer });
  } catch (err) {
    console.error("API error:", err?.message || err);
    const msg = (err?.status ? `API ${err.status}: ` : "") + (err?.error?.message || err.message || "API error");
    res.status(500).json({ error: msg });
  }
});

app.get("/api/health", (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
