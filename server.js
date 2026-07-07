const express = require('express');
const fs = require('fs');
const path = require('path');

const HCTI_USER_ID = process.env.HCTI_USER_ID;
const HCTI_API_KEY = process.env.HCTI_API_KEY;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const TEMPLATE_PATH = path.join(__dirname, 'template.html');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHeadlineHtml(headline, highlightWords) {
  let safe = escapeHtml(headline);
  const words = (highlightWords || [])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const word of words) {
    const escapedWord = escapeHtml(word);
    const pattern = escapedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(pattern, 'i');
    if (regex.test(safe)) {
      safe = safe.replace(regex, (match) => `<span class="hl">${match}</span>`);
    }
  }
  return safe;
}

app.post('/render-poster', async (req, res) => {
  try {
    const { headline, highlightWords, backgroundUrl, logoUrl } = req.body;

    if (!headline || !backgroundUrl || !logoUrl) {
      return res.status(400).json({
        error: 'Missing required fields: headline, backgroundUrl, logoUrl are required.',
      });
    }

    if (!HCTI_USER_ID || !HCTI_API_KEY) {
      return res.status(500).json({
        error: 'Server is missing HCTI_USER_ID / HCTI_API_KEY environment variables.',
      });
    }

    const headlineHtml = buildHeadlineHtml(headline, highlightWords);

    let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    html = html
      .replace('{{HEADLINE_HTML}}', headlineHtml)
      .replace('{{BACKGROUND_URL}}', backgroundUrl)
      .replace('{{LOGO_URL}}', logoUrl);

    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    const css = styleMatch ? styleMatch[1] : '';
    const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;

    const hctiRes = await fetch('https://hcti.io/v1/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${HCTI_USER_ID}:${HCTI_API_KEY}`).toString('base64'),
      },
      body: JSON.stringify({
        html: bodyHtml,
        css: css,
        viewport_width: 1080,
        viewport_height: 1350,
        device_scale: 1,
      }),
    });

    const hctiData = await hctiRes.json();

    if (!hctiRes.ok || !hctiData.url) {
      console.error('HCTI error:', hctiData);
      return res.status(502).json({ error: 'Image generation failed', details: hctiData });
    }

    res.json({ posterUrl: hctiData.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Poster render server listening on port ${PORT}`));
