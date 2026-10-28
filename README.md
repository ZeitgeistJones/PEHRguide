# PracticeEHR Training Companion

A mobile-friendly, searchable, shareable training site based on the October 23 training guide. No patient screenshots or private recording are included.

## Deploy to Vercel

1. Extract this ZIP.
2. Create a new GitHub repository and upload the *contents* of the site folder (not the outer ZIP).
3. In Vercel: **Add New → Project → Import** that repository. Keep Framework Preset **Other**, then click **Deploy**.
4. Once live, copy the Vercel `*.vercel.app` address and share it. The guide and local search work immediately.
5. **To enable real generative AI responses:** In Vercel **Project Settings → Environment Variables**, add `GEMINI_API_KEY` with a key from [Google AI Studio](https://aistudio.google.com/apikey); redeploy. Optionally set `GEMINI_MODEL` (default `gemini-3.5-flash-lite`). Never add your key in public HTML or commit it to GitHub. On Gemini's free tier, Google may use prompts to improve its products.

## Privacy and safety
- Public site includes NO original video, audio, or patient screenshots. Guide text alone is supplied to the AI endpoint.
- The assistant is an educational tool, not a HIPAA-compliant clinical system. Do not enter patient-identifiable data. The simple browser-side identifier check cannot ensure privacy or HIPAA compliance.
- Do not share original meeting recording publicly without permission.
- Do not use AI output as clinical documentation without reviewing it.
- Anyone with the website address can use the assistant and incur API costs; apply suitable authentication, rate limits and privacy review before distributing widely.
- Without a configured API key, the assistant falls back to local topic matching and explicitly labels itself non-generative.

## Files
- `index.html` – site layout; loads all content from `knowledge.json`
- `knowledge.json` – single source of content: training guide, telehealth, official help videos, FAQs, release notes, support contacts (used by both the page and the AI helper)
- `api/chat.js` – server-side Gemini proxy
