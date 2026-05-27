# NovaAI Cloud App

NovaAI is set up as a **hosted website + hosted backend + Android WebView app**.

You do **not** need to turn on a localhost server after deployment.

## Final architecture

```txt
Android APK → GitHub Pages website → Render backend → OpenRouter/Groq
```

Localhost is only optional for development. The real app uses your Render URL.

---

## 1. Create GitHub repo

Create a repo, for example:

```txt
novaai-app
```

Upload/push this whole project to GitHub.

```bash
git init
git add .
git commit -m "Initial NovaAI cloud app"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/novaai-app.git
git push -u origin main
```

---

## 2. Deploy backend on Render

In Render:

```txt
New → Web Service → Connect GitHub repo
```

Use:

| Field | Value |
|---|---|
| Name | `novaai-backend` |
| Runtime | Node |
| Branch | `main` |
| Build Command | `npm install` |
| Start Command | `npm start` |

Add environment variables in Render:

```env
OPENROUTER_API_KEY=sk-or-your-openrouter-key
GROQ_API_KEY=gsk_your-groq-key
ALLOWED_ORIGINS=https://YOUR_GITHUB_USERNAME.github.io
APP_REFERER=https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/
APP_TITLE=NovaAI
```

After deploy, Render gives a URL like:

```txt
https://novaai-backend.onrender.com
```

Test:

```txt
https://novaai-backend.onrender.com/api/health
```

You should see JSON with `ok: true`.

---

## 3. Put Render backend URL into website

Open:

```txt
public/novaai.config.js
```

Replace:

```js
BACKEND_URL: 'https://YOUR_RENDER_BACKEND_URL.onrender.com'
```

with your real Render backend URL:

```js
BACKEND_URL: 'https://novaai-backend.onrender.com'
```

Commit and push:

```bash
git add .
git commit -m "Set Render backend URL"
git push
```

Now the website and APK can use the backend without localhost.

---

## 4. Deploy website using GitHub Pages

The project includes:

```txt
.github/workflows/deploy-pages.yml
```

In GitHub:

```txt
Repo → Settings → Pages → Source → GitHub Actions
```

After the workflow runs, your website should be:

```txt
https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/
```

Example:

```txt
https://yashmet2025.github.io/novaai-app/
```

Open the site and click **Check backend**.

---

## 5. Set website URL in Android app

Open Android Studio and select only this folder:

```txt
android/
```

Then open:

```txt
android/app/src/main/res/values/strings.xml
```

Set your hosted website URL:

```xml
<resources>
    <string name="app_name">NovaAI</string>
    <string name="web_app_url">https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/</string>
</resources>
```

Example:

```xml
<resources>
    <string name="app_name">NovaAI</string>
    <string name="web_app_url">https://yashmet2025.github.io/novaai-app/</string>
</resources>
```

The APK loads this website. It does not load localhost.

---

## 6. Build APK

In Android Studio:

```txt
Build → Build Bundle(s) / APK(s) → Build APK(s)
```

Debug APK path:

```txt
android/app/build/outputs/apk/debug/app-debug.apk
```

For release APK:

```txt
Build → Generate Signed Bundle / APK → APK
```

---

## Important notes

- Do not put API keys in `public/index.html`, `novaai.config.js`, or Android files.
- API keys belong only in Render environment variables.
- Render free services may sleep after inactivity; first response can be slow.
- Ollama still needs a local machine because Ollama is local by design. For no-localhost usage, use OpenRouter or Groq provider.
