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

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(rootDir, 'public')));

// ── Provider config ───────────────────────────────────────────────────────────
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

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'NovaAI Backend',
    version: '1.0.0',
    providers: providerStatus(),
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// ── Chat endpoint ─────────────────────────────────────────────────────────────
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

    // Validate provider
    const config = PROVIDERS[provider];
    if (!config) {
      return res.status(400).json({ error: `Unsupported provider: ${provider}. Use 'groq' or 'openrouter'.` });
    }

    // Validate model
    if (!model || typeof model !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid model field.' });
    }

    // Validate messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array.' });
    }

    // Check API key exists
    const apiKey = process.env[config.keyName];
    if (!apiKey) {
      return res.status(500).json({
        error: `${config.keyName} is not set. Add it to your Render environment variables.`
      });
    }

    // Call upstream API
    const upstream = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...config.extraHeaders
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens, stream })
    });

    // Handle upstream errors
    if (!upstream.ok) {
      const text = await upstream.text();
      let errorMsg = text;
      try {
        const json = JSON.parse(text);
        errorMsg = json.error?.message || json.message || text;
      } catch {}
      console.error(`[${provider}] Upstream error ${upstream.status}:`, errorMsg);

      // Friendly messages for common errors
      if (upstream.status === 429) {
        return res.status(429).json({
          error: `Rate limited by ${provider}. Please wait a moment then try again, or switch to Groq provider which has higher free limits.`
        });
      }
      if (upstream.status === 400 && errorMsg.includes('decommissioned')) {
        return res.status(400).json({
          error: `Model "${model}" has been decommissioned by ${provider}. Please select a different model.`
        });
      }
      if (upstream.status === 401) {
        return res.status(401).json({
          error: `Invalid API key for ${provider}. Check your ${config.keyName} in Render environment variables.`
        });
      }

      return res.status(upstream.status).json({ error: errorMsg });
    }

    // Non-streaming response
    if (!stream) {
      const data = await upstream.json();
      return res.json(data);
    }

    // Streaming response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const reader = upstream.body.getReader();

    // Cancel stream if client disconnects
    req.on('close', () => {
      try { reader.cancel(); } catch {}
    });

    // Pump stream to client
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();

  } catch (err) {
    console.error('[/api/chat] Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    } else {
      // Stream already started — send error as SSE chunk then close
      try {
        res.write(`data: ${JSON.stringify({
          choices: [{ delta: { content: `\n\n⚠️ Server error: ${err.message}` } }]
        })}\n\n`);
        res.end();
      } catch {}
    }
  }
});

// ── Models list endpoint ──────────────────────────────────────────────────────
// Updated May 2025 — removed all decommissioned Groq models
app.get('/api/models', (_req, res) => {
  res.json({
    groq: [
      // ✅ Active models as of May 2025
      { id: 'llama-3.3-70b-versatile',        name: 'LLaMA 3.3 70B',        default: true },
      { id: 'llama-3.1-8b-instant',            name: 'LLaMA 3.1 8B (fast)'               },
      { id: 'llama3-8b-8192',                  name: 'LLaMA3 8B'                          },
      { id: 'mixtral-8x7b-32768',              name: 'Mixtral 8x7B'                       },
      { id: 'gemma-7b-it',                     name: 'Gemma 7B'                           },
      // ❌ REMOVED — decommissioned by Groq:
      // deepseek-r1-distill-llama-70b
      // gemma2-9b-it
      // qwen-qwq-32b
      // llama3-70b-8192
    ],
    openrouter: [
      // ✅ Free models
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'LLaMA 3.3 70B',   free: true,  default: true },
      { id: 'meta-llama/llama-3.1-8b-instruct:free',  name: 'LLaMA 3.1 8B',    free: true  },
      { id: 'google/gemma-3-27b-it:free',              name: 'Gemma 3 27B',     free: true  },
      { id: 'google/gemma-3-12b-it:free',              name: 'Gemma 3 12B',     free: true  },
      { id: 'deepseek/deepseek-r1:free',               name: 'DeepSeek R1',     free: true  },
      { id: 'deepseek/deepseek-chat:free',             name: 'DeepSeek V3',     free: true  },
      { id: 'mistralai/mistral-7b-instruct:free',      name: 'Mistral 7B',      free: true  },
      { id: 'microsoft/phi-3-mini-128k-instruct:free', name: 'Phi-3 Mini',      free: true  },
      // 💰 Paid models
      { id: 'anthropic/claude-3.5-sonnet',             name: 'Claude 3.5 Sonnet', free: false },
      { id: 'openai/gpt-4o',                           name: 'GPT-4o',            free: false },
      { id: 'openai/gpt-4o-mini',                      name: 'GPT-4o Mini',       free: false },
      { id: 'google/gemini-pro-1.5',                   name: 'Gemini Pro 1.5',    free: false },
    ]
  });
});

// ── Catch-all — serve frontend ────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ NovaAI backend running on http://localhost:${PORT}`);
  console.log(`   Groq key:        ${process.env.GROQ_API_KEY       ? '✓ set' : '✗ missing'}`);
  console.log(`   OpenRouter key:  ${process.env.OPENROUTER_API_KEY ? '✓ set' : '✗ missing'}`);
});
