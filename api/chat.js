// PracticeEHR training companion — OpenAI proxy
// Reads public guide text from knowledge.json and answers from that only.

const fs = require("fs");
const path = require("path");

let knowledge = [];
try {
  knowledge = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "knowledge.json"), "utf8")
  );
} catch (err) {
  console.error("Failed to load knowledge.json", err);
}

function extractAnswer(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];
  for (const item of data.output || []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c && (c.type === "output_text" || c.type === "text") && c.text) {
          parts.push(c.text);
        }
      }
    }
  }
  return parts.join("\n").trim();
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "AI assistant not configured" });
  }

  if (!Array.isArray(knowledge) || knowledge.length === 0) {
    return res.status(500).json({ error: "Training guide unavailable" });
  }

  const { message, history = [] } = req.body || {};
  if (typeof message !== "string" || !message.trim() || message.length > 1200) {
    return res.status(400).json({ error: "Invalid question" });
  }

  if (
    /\b(?:ssn|social security|date of birth|dob|mrn|medical record number)\b/i.test(
      message
    )
  ) {
    return res.status(400).json({ error: "Do not include patient information" });
  }

  const ctx = knowledge
    .map(
      (s) =>
        `${s.title} (${s.timestamp}): ${s.intro}\n${s.steps
          .map((v, i) => `${i + 1}. ${v}`)
          .join("\n")}`
    )
    .join("\n\n");

  const prompt =
    "You are a friendly PracticeEHR training companion. Answer ONLY from the supplied training guide below, not from assumptions about actual UI buttons. Be concise, actionable, numbered steps (usually 2-5). If guide does not establish a step, clearly say it is not confirmed and advise checking with a trainer or practice admin. Never diagnose or give medical advice. Do not ask for or accept any patient-identifiable information. Never imply you can see the user's account, recording, screen, or chart. No external links unless already in guide.\n\nGUIDE:\n" +
    ctx;

  const previous = Array.isArray(history)
    ? history
        .slice(-6)
        .filter(
          (x) =>
            ["user", "assistant"].includes(x.role) &&
            typeof x.content === "string" &&
            x.content.length < 1300
        )
        .map((x) => ({ role: x.role, content: x.content }))
    : [];

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: prompt,
        input: [...previous, { role: "user", content: message }],
        max_output_tokens: 450,
        store: false
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error("OpenAI error", upstream.status, errText.slice(0, 500));
      throw new Error("Upstream request failed: " + upstream.status);
    }

    const data = await upstream.json();
    const answer = extractAnswer(data);
    return res.status(200).json({
      answer: answer || "No response returned. Please consult the guide."
    });
  } catch (e) {
    console.error("chat handler failed", e);
    return res.status(502).json({
      error: "AI temporarily unavailable. Use the built-in guide search."
    });
  }
};
