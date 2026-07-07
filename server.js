const express = require('express');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const app = express();
app.use(express.json({ limit: '5mb' }));

const TEMPLATE_PATH = path.join(__dirname, 'template.html');

// Escapes user text so it can't break the HTML structure
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Wraps each highlight word/phrase in <span class="hl">, case-insensitive
function buildHeadlineHtml(headline, highlightWords) {
  let safe = escapeHtml(headline);
  const words = (highlightWords || [])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // longest phrases first, avoids partial overlaps

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

    const headlineHtml = buildHeadlineHtml(headline, highlightWords);

    let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    html = html
      .replace('{{HEADLINE_HTML}}', headlineHtml)
      .replace('{{BACKGROUND_URL}}', backgroundUrl)
      .replace('{{LOGO_URL}}', logoUrl);

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1080, height: 1350 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const buffer = await page.screenshot({ type: 'png' });
    await browser.close();

    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Poster render server listening on port ${PORT}`));
