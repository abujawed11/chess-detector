# Environment Configuration Guide

## Setting Up Your API Base URL

All API calls in the application now use a **centralized configuration** from `src/config/api.js`.

### Step 1: Create `.env` File

Create a new file called `.env` in the `chess-web-scan` directory (same level as `package.json`):

```bash
# In chess-web-scan directory
touch .env
```

### Step 2: Add Configuration

Add the following to your `.env` file:

```env
# Backend API Base URL
# Change this to your production backend URL when deploying
VITE_API_BASE_URL=http://localhost:8000
```

### Step 3: Restart Development Server

After creating/updating `.env`, restart your Vite dev server:

```bash
npm run dev
```

---

## Different Environments

### Local Development
```env
VITE_API_BASE_URL=http://localhost:8000
```

### Production (Example)
```env
VITE_API_BASE_URL=https://api.yourdomain.com
```

### LAN/Network Testing (Example)
```env
VITE_API_BASE_URL=http://192.168.1.100:8000
```

---

## How It Works

1. **Centralized Config**: All API base URLs are imported from `src/config/api.js`
2. **Environment Variable**: The config file reads `VITE_API_BASE_URL` from your `.env` file
3. **Default Fallback**: If no `.env` exists, it defaults to `http://localhost:8000`
4. **Updated Files**: 
   - `src/App.jsx` (for `/infer` endpoint)
   - `src/hooks/useStockfish.js` (for `/analyze`, `/start_engine`)
   - `src/services/evaluationService.js` (for `/evaluate`)
   - `src/services/backendStockfishService.js` (for all engine endpoints)
   - `src/PGNAnalysis.jsx` (for `/stop_engine`)

---

## Troubleshooting

### Changes Not Applied?
Make sure to:
1. Restart your development server after creating/modifying `.env`
2. Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
3. Check browser console for any API errors

### CORS Issues?
If you're running the backend on a different domain, make sure your Flask backend has CORS enabled:

```python
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
```

---

## Security Note

⚠️ **Never commit your `.env` file to Git!**

The `.env` file is already in `.gitignore` by default in Vite projects. This prevents sensitive configuration from being exposed in version control.

