// PracticeEHR training companion — Gemini proxy
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
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p && typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("\n")
    .trim();
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  if (!process.env.GEMINI_API_KEY) {
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
    "You are a friendly PracticeEHR training companion. Answer ONLY from the supplied training guide below, not from assumptions about actual UI buttons. Be concise, actionable, numbered steps (usually 2-5). Use plain text, no markdown formatting. If guide does not establish a step, clearly say it is not confirmed and advise checking with a trainer or practice admin. Never diagnose or give medical advice. Do not ask for or accept any patient-identifiable information. Never imply you can see the user's account, recording, screen, or chart. No external links unless already in guide.\n\nGUIDE:\n" +
    ctx;

  const previous = Array.isArray(history)
    ? history
        .slice(-6)
        .filter(
          (x) =>
            x &&
            ["user", "assistant"].includes(x.role) &&
            typeof x.content === "string" &&
            x.content.length < 1300
        )
        .map((x) => ({
          role: x.role === "assistant" ? "model" : "user",
          parts: [{ text: x.content }]
        }))
    : [];

  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt }] },
        contents: [...previous, { role: "user", parts: [{ text: message }] }],
        generationConfig: { maxOutputTokens: 1024 }
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error("Gemini error", model, upstream.status, errText.slice(0, 500));
      throw new Error("Upstream request failed: " + upstream.status);
    }

    const data = await upstream.json();
    const answer = extractAnswer(data);
    if (!answer) {
      console.error(
        "Gemini returned no text",
        model,
        JSON.stringify(data?.candidates?.[0]?.finishReason || data?.promptFeedback || {})
      );
    }
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
