// PracticeEHR training companion — Gemini proxy
// Reads guide + official resources from knowledge.json and answers from that only.

const fs = require("fs");
const path = require("path");

let knowledge = null;
try {
  knowledge = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "knowledge.json"), "utf8")
  );
} catch (err) {
  console.error("Failed to load knowledge.json", err);
}

function buildContext(k) {
  const guide = (k.guide || [])
    .map((s) => {
      const label = s.source === "official" ? "OFFICIAL" : "TRAINING";
      const lines = [`[${label}] ${s.title} (${s.timestamp}): ${s.intro}`];
      (s.steps || []).forEach((v, i) => lines.push(`${i + 1}. ${v}`));
      (s.tips || []).forEach((t) => lines.push(`Tip: ${t}`));
      if (s.video) lines.push(`Video: ${s.video.title} — ${s.video.url}`);
      (s.links || []).forEach((l) => lines.push(`Link: ${l.label} — ${l.url}`));
      return lines.join("\n");
    })
    .join("\n\n");

  const faqs = (k.faqs || []).map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");

  const videos = (k.videos || [])
    .map(
      (g) =>
        `${g.label}:\n` +
        g.items.map((v) => `- ${v.title} (updated ${v.updated}) — ${v.url}\n  ${v.summary}`).join("\n")
    )
    .join("\n\n");

  const releases = (k.releases || [])
    .map((r) => `${r.month} (${r.url}): ${r.items.join("; ")}`)
    .join("\n");

  const s = k.support || {};
  const support = `Phone ${s.phone} (${s.phoneNote}). Email ${s.email} (${s.emailNote}). Help Center ${s.helpCenter}. FAQ ${s.faqPage}.`;

  return `GUIDE:\n${guide}\n\nOFFICIAL FAQ:\n${faqs}\n\nOFFICIAL HELP VIDEOS:\n${videos}\n\nRECENT RELEASES:\n${releases}\n\nSUPPORT:\n${support}`;
}

const ctx = knowledge && Array.isArray(knowledge.guide) ? buildContext(knowledge) : "";

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

  if (!ctx) {
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

  const prompt =
    "You are a friendly PracticeEHR training companion for clinic staff. Answer ONLY from the material below: the internal training guide (marked TRAINING), official PracticeEHR guidance (marked OFFICIAL), the official FAQ, help videos, release notes, and support contacts. Do not invent buttons or menus that are not described. Be concise and actionable, using numbered steps (usually 2-6). Use plain text, no markdown formatting. When a relevant help video exists, end with one line: Video: <title> — <url>. If the material does not establish something, say it is not confirmed and suggest the trainer, practice admin, or PracticeEHR support. Never diagnose or give medical advice. Do not ask for or accept patient-identifiable information. Never imply you can see the user's account, screen, or chart. Only share links that appear in the material.\n\n" +
    ctx;

  const previous = Array.isArray(history)
    ? history
        .slice(-6)
        .filter(
          (x) =>
            x &&
            ["user", "assistant"].includes(x.role) &&
            typeof x.content === "string" &&
            x.content.length < 2000
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
        generationConfig: { maxOutputTokens: 1200 }
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
