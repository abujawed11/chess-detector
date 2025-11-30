# Deployment Headers for Browser Stockfish

Your app uses browser-based Stockfish WASM which requires special HTTP headers for `SharedArrayBuffer` support.

## Required Headers

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

---

## Platform-Specific Configuration

### ✅ Netlify

Already configured! The `netlify.toml` and `public/_headers` files are set up.

**Deploy:**
```bash
npm run build
# Upload dist/ folder to Netlify or connect your Git repo
```

---

### Vercel

Create `vercel.json` in your project root:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        },
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        }
      ]
    }
  ]
}
```

---

### Apache (.htaccess)

Add to your `.htaccess` file:

```apache
<IfModule mod_headers.c>
  Header set Cross-Origin-Opener-Policy "same-origin"
  Header set Cross-Origin-Embedder-Policy "require-corp"
</IfModule>
```

---

### Nginx

Add to your nginx config:

```nginx
location / {
  add_header Cross-Origin-Opener-Policy same-origin;
  add_header Cross-Origin-Embedder-Policy require-corp;
}
```

---

### Cloudflare Pages

Create `_headers` file in `public/` (already done!):

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

---

### GitHub Pages

GitHub Pages doesn't support custom headers directly. You have two options:

**Option 1: Use Cloudflare in front**
1. Deploy to GitHub Pages
2. Add Cloudflare DNS
3. Set headers in Cloudflare Workers

**Option 2: Fall back to backend Stockfish**
- Keep using your VPS backend for GitHub Pages deployment
- Browser engine won't work without headers

---

## Testing Headers

After deployment, verify headers are set:

```bash
curl -I https://your-domain.com
```

You should see:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Or check in browser DevTools:
1. Open Network tab
2. Reload page
3. Click on the main document
4. Check Response Headers

---

## Troubleshooting

### SharedArrayBuffer is not defined

**Cause:** Headers not configured properly

**Fix:**
1. Verify headers are set (use curl or DevTools)
2. Clear browser cache
3. Try incognito/private mode
4. Check platform-specific config above

### CORS errors after adding headers

**Cause:** `require-corp` requires all resources to be same-origin or have CORP headers

**Fix:**
- Make sure all assets (images, fonts) are on same domain
- For CDN resources, they need `Cross-Origin-Resource-Policy` header
- Or self-host all resources

---

## Development vs Production

**Development (Vite):**
- Headers configured in `vite.config.js` ✅
- Works automatically on `npm run dev`

**Production:**
- Choose platform config above
- Test after deployment
- Fallback to backend if headers can't be set

---

## Why Are These Headers Needed?

`SharedArrayBuffer` enables multi-threading in the browser, which Stockfish uses for parallel search. For security reasons (Spectre/Meltdown vulnerabilities), browsers require these headers to isolate the page from other origins.

**Benefits:**
- Multi-threaded engine (4-6 cores)
- Faster analysis
- Better move search

**Without headers:**
- Single-threaded only
- Slower analysis
- Or fall back to backend engine

---

## Need Help?

If headers can't be configured on your hosting platform, you have two options:

1. **Use a different platform** (Netlify, Vercel, Cloudflare Pages)
2. **Keep using backend Stockfish** for that deployment
   - Web app can use backend (like React Native)
   - Just don't deploy the browser engine changes
   - Use the backend version of the code

---

**Current Status:**
- ✅ Development headers configured (`vite.config.js`)
- ✅ Netlify ready (`netlify.toml`, `_headers`)
- ✅ Cloudflare Pages ready (`_headers`)
- ⚠️ Other platforms: Use configs above
