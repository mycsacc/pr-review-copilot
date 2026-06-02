const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function parsePRUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) throw new Error('Invalid GitHub PR URL');
  return { owner: match[1], repo: match[2], pullNumber: match[3] };
}

async function fetchPRDiff(owner, repo, pullNumber) {
  const response = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    }
  );

  const files = response.data;
  if (files.length > 100) {
    throw new Error(`PR too large (${files.length} files). Max is 100.`);
  }

  return files.map(f => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch || '(binary or no diff)',
  }));
}

function buildPrompt(files, prMeta) {
  const diffText = files.map(f =>
    `--- FILE: ${f.filename} [${f.status}] +${f.additions} -${f.deletions} ---\n${f.patch}`
  ).join('\n\n');

  return `You are a senior software engineer doing a thorough code review.

PR: ${prMeta.owner}/${prMeta.repo} #${prMeta.pullNumber}
Files changed: ${files.length}

DIFF:
${diffText}

Return ONLY a valid JSON object with this exact structure, no markdown, no explanation:
{
  "summary": "2-3 sentence plain English explanation of what this PR does",
  "complexity": <number 1-10>,
  "bugs": [
    { "file": "filename", "severity": "critical|warning|info", "description": "what the bug is and why it matters" }
  ],
  "security_issues": [
    { "file": "filename", "severity": "critical|warning|info", "description": "what the issue is" }
  ],
  "suggestions": [
    { "file": "filename", "type": "performance|readability|best-practice", "description": "specific actionable suggestion" }
  ],
  "verdict": "approve|request-changes|needs-discussion"
}

If there are no bugs, security issues, or suggestions, return empty arrays. Be specific — reference actual line content from the diff, not generic advice.`;
}

app.post('/review', async (req, res) => {
  const { prUrl } = req.body;
  if (!prUrl) return res.status(400).json({ error: 'prUrl is required' });

  try {
    const prMeta = parsePRUrl(prUrl);
    const files = await fetchPRDiff(prMeta.owner, prMeta.repo, prMeta.pullNumber);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({ type: 'meta', pr: prMeta, filesChanged: files.length })}\n\n`);

    const prompt = buildPrompt(files, prMeta);

    const result = await genAI.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    let fullText = '';
    for await (const chunk of result) {
      const text = chunk.text;
      fullText += text;
      res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
    }

    try {
      const cleaned = fullText.replace(/```json|```/g, '').trim();
      const review = JSON.parse(cleaned);
      res.write(`data: ${JSON.stringify({ type: 'done', review })}\n\n`);
    } catch {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to parse AI response as JSON' })}\n\n`);
    }

    res.end();

  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    }
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/wake', (req, res) => res.json({ status: 'awake' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));