# Nginx Deployment Guide

## 📦 Your Setup

**Frontend Build Location:** `/var/www/chess-web`
**Backend API:** `http://93.127.199.118:8090`

---

## 🚀 Deployment Steps

### 1. **Build Your Frontend**

```bash
# On your local machine
cd chess-web-scan
npm run build

# This creates the 'dist' folder
```

### 2. **Upload to Server**

```bash
# Copy build files to server
scp -r dist/* your-user@your-server:/var/www/chess-web/

# Or if already uploaded:
# Files should be at: /var/www/chess-web/
```

### 3. **Install Nginx** (if not installed)

```bash
# On Ubuntu/Debian
sudo apt update
sudo apt install nginx

# On CentOS/RHEL
sudo yum install nginx
```

### 4. **Deploy Nginx Config**

**Option A: Copy the config file to server**

```bash
# Upload nginx.conf to server
scp nginx.conf your-user@your-server:/tmp/

# On server:
sudo cp /tmp/nginx.conf /etc/nginx/sites-available/chess-web
sudo ln -s /etc/nginx/sites-available/chess-web /etc/nginx/sites-enabled/
```

**Option B: Create directly on server**

```bash
# On server:
sudo nano /etc/nginx/sites-available/chess-web

# Paste the nginx.conf content
# Save and exit (Ctrl+X, Y, Enter)

# Enable the site
sudo ln -s /etc/nginx/sites-available/chess-web /etc/nginx/sites-enabled/
```

### 5. **Update Domain Name**

Edit the config:

```bash
sudo nano /etc/nginx/sites-available/chess-web
```

Change line 7:
```nginx
server_name your-domain.com;  # ← Change to your actual domain or IP
```

Example:
```nginx
server_name chess.example.com;  # Domain
# OR
server_name 93.127.199.118;     # IP address
```

### 6. **Set Correct Permissions**

```bash
# Make sure nginx can read the files
sudo chown -R www-data:www-data /var/www/chess-web
sudo chmod -R 755 /var/www/chess-web
```

### 7. **Test Nginx Configuration**

```bash
sudo nginx -t
```

**Expected output:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 8. **Restart Nginx**

```bash
sudo systemctl restart nginx

# Enable nginx to start on boot
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

---

## 🧪 Testing

### Test 1: Check if Site Loads

```bash
curl http://your-domain-or-ip/
```

You should see HTML content.

### Test 2: Check COOP/COEP Headers

```bash
curl -I http://your-domain-or-ip/
```

**You should see:**
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Test 3: Check API Proxy

```bash
# Test backend connection through nginx
curl http://your-domain-or-ip/api/health
```

### Test 4: Browser Test

Open in browser:
```
http://your-domain-or-ip/
```

**Check browser console:**
- ✅ No SharedArrayBuffer errors
- ✅ Engine initializes with 6 threads
- ✅ Analysis works

---

## 🔧 Troubleshooting

### Issue: 403 Forbidden

**Solution:**
```bash
sudo chown -R www-data:www-data /var/www/chess-web
sudo chmod -R 755 /var/www/chess-web
```

### Issue: 502 Bad Gateway (API calls fail)

**Check backend is running:**
```bash
curl http://93.127.199.118:8090/health
```

**Check nginx error logs:**
```bash
sudo tail -f /var/nginx/error.log
```

### Issue: SharedArrayBuffer still not available

**Check headers are set:**
```bash
curl -I http://your-domain/index.html | grep Cross-Origin
```

Should show:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Issue: WASM files not loading

**Check WASM file exists:**
```bash
ls -lh /var/www/chess-web/*.wasm
```

**Check permissions:**
```bash
sudo chmod 644 /var/www/chess-web/*.wasm
```

---

## 📊 File Structure Check

Your `/var/www/chess-web` should look like:

```
/var/www/chess-web/
├── index.html
├── assets/
│   ├── index-abc123.js
│   ├── index-def456.css
│   └── ...
├── stockfish-17.1-8e4d048.js
├── stockfish-17.1-8e4d048.wasm
├── stockfish-17.1-8e4d048.worker.wasm
├── stockfish-17.1-8e4d048.mem.wasm
├── ... (other WASM files)
└── opening_book.json (optional)
```

---

## 🔐 SSL/HTTPS Setup (Recommended)

### Using Let's Encrypt (Free)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Auto-renew certificate
sudo certbot renew --dry-run
```

Certbot will automatically update your nginx config for HTTPS!

---

## 🎯 Quick Checklist

- [ ] Files uploaded to `/var/www/chess-web`
- [ ] Nginx config copied to `/etc/nginx/sites-available/chess-web`
- [ ] Symlink created in `/etc/nginx/sites-enabled/`
- [ ] Domain name updated in config
- [ ] File permissions set (755 for dirs, 644 for files)
- [ ] Nginx config tested (`sudo nginx -t`)
- [ ] Nginx restarted
- [ ] Headers verified (`curl -I ...`)
- [ ] Site loads in browser
- [ ] Stockfish initializes with threads
- [ ] API calls work (YOLO detection)

---

## 🆘 Support

**View nginx logs:**
```bash
# Error log
sudo tail -f /var/log/nginx/error.log

# Access log
sudo tail -f /var/log/nginx/access.log
```

**Reload nginx (after config changes):**
```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Restart nginx:**
```bash
sudo systemctl restart nginx
```

---

**Your app should now be running at: `http://your-domain-or-ip/`** 🚀
