import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
else {
      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(rootDir, 'public')));

const PROVIDERS = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyName: 'OPENROUTER_API_KEY',
    extraHeaders: {
      'HTTP-Referer': process.env.APP_REFERER || 'https://novaai.local',
      'X-Title': process.env.APP_TITLE || 'NovaAI'
    }
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyName: 'GROQ_API_KEY',
    extraHeaders: {}
  }
};

function providerStatus() {
  return {
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY)
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'NovaAI Backend',
    providers: providerStatus()
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const {
      provider = 'openrouter',
      model,
      messages,
      temperature = 0.7,
      max_tokens = 2048,
      stream = true
    } = req.body || {};

    const config = PROVIDERS[provider];
    if (!config) {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }
    if (!model || typeof model !== 'string') {
      return res.status(400).json({ error: 'Missing model.' });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages.' });
    }

    const apiKey = process.env[config.keyName];
    if (!apiKey) {
      return res.status(500).json({ error: `${config.keyName} is not set on the backend.` });
    }

    const upstream = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...config.extraHeaders
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
        stream
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      let error = text;
      try {
        const json = JSON.parse(text);
        error = json.error?.message || json.message || text;
      } catch {}
      return res.status(upstream.status).json({ error });
    }

    if (!stream) {
      const data = await upstream.json();
      return res.json(data);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };

    req.on('close', () => {
      try { reader.cancel(); } catch {}
    });

    await pump();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Server error' });
    } else {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n⚠️ Backend error: ${err.message}` } }] })}\n\n`);
      res.end();
    }
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`NovaAI backend running on http://localhost:${PORT}`);
});
