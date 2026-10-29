// Live "Ruby & Vin input" board — notes they leave while using the site.
// Stored in Vercel Blob (prefix kept as ruby-input/ so older notes still load).

const { put, list, del, get } = require("@vercel/blob");

const PREFIX = "ruby-input/";
const PHI_RE =
  /\b(?:ssn|social security|date of birth|dob|mrn|medical record number)\b/i;

function badRequest(res, error) {
  return res.status(400).json({ error });
}

async function readNote(pathname) {
  const result = await get(pathname, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN
  });
  if (!result || !result.stream) return null;
  const chunks = [];
  for await (const chunk of result.stream) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

async function readAll() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN missing");
  }
  const { blobs } = await list({
    prefix: PREFIX,
    token: process.env.BLOB_READ_WRITE_TOKEN
  });
  const items = [];
  for (const b of blobs) {
    try {
      const note = await readNote(b.pathname);
      if (note && note.id && note.text) items.push(note);
    } catch (err) {
      console.error("Failed reading ruby blob", b.pathname, err);
    }
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: "Ruby & Vin input storage is not configured yet."
    });
  }

  try {
    if (req.method === "GET") {
      const items = await readAll();
      return res.status(200).json({ items });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 40)
          : "Ruby or Vin";
      const status = body.status === "done" ? "done" : "open";

      if (!text || text.length > 2000) {
        return badRequest(res, "Write a note between 1 and 2000 characters.");
      }
      if (PHI_RE.test(text)) {
        return badRequest(
          res,
          "Please remove patient identifiers before saving."
        );
      }

      // Update existing note status
      if (typeof body.id === "string" && body.id && body.action === "status") {
        const items = await readAll();
        const found = items.find((n) => n.id === body.id);
        if (!found) return res.status(404).json({ error: "Note not found" });
        found.status = status;
        found.updatedAt = new Date().toISOString();
        await put(PREFIX + found.id + ".json", JSON.stringify(found), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json",
          token: process.env.BLOB_READ_WRITE_TOKEN
        });
        return res.status(200).json({ item: found });
      }

      if (typeof body.id === "string" && body.id && body.action === "delete") {
        await del(PREFIX + body.id + ".json", {
          token: process.env.BLOB_READ_WRITE_TOKEN
        });
        return res.status(200).json({ ok: true });
      }

      const id =
        Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const item = {
        id,
        name,
        text,
        status: "open",
        createdAt: new Date().toISOString()
      };
      await put(PREFIX + id + ".json", JSON.stringify(item), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      return res.status(201).json({ item });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (err) {
    console.error("ruby-input failed", err);
    return res.status(500).json({ error: "Could not save or load Ruby & Vin input." });
  }
};
