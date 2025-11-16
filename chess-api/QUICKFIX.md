# Quick Fix Guide - Connection Reset Error

## Error You're Seeing

```
POST http://localhost:8000/start_engine net::ERR_CONNECTION_RESET
❌ Backend Stockfish initialization failed: TypeError: Failed to fetch
```

## Cause

The backend server is either:
1. Not running
2. Crashing when trying to start the engine
3. Having issues with the Stockfish binary

## Fix Steps

### Step 1: Check Diagnostics

```bash
cd chess-api
python diagnose.py
```

This will tell you exactly what's wrong. If all checks pass, proceed to Step 2.

### Step 2: Restart the Backend Server

**Stop the current server** (if running):
- Press `Ctrl+C` in the terminal running the server

**Start it again with logging:**

```bash
cd chess-api
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Watch the terminal for errors. You should see:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Step 3: Test Backend Manually

In another terminal:

```bash
# Test health endpoint
curl http://localhost:8000/health

# Should return: {"ok":true}

# Test start engine
curl -X POST http://localhost:8000/start_engine

# Should return: {"status":"started",...}
```

If you see errors, check the backend terminal for details.

### Step 4: Refresh Frontend

Once the backend is running:
1. Refresh your browser (F5)
2. Check browser console
3. Should see: ✅ Backend Stockfish initialized successfully

---

## Common Issues

### Issue 1: "Stockfish binary not found"

**Fix:**
1. Edit `chess-api/.env`
2. Set correct path:
   ```
   STOCKFISH_PATH=D:/path/to/stockfish.exe
   ```
3. Restart backend server

### Issue 2: "Port 8000 already in use"

**Fix:**
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :8000
kill -9 <PID>
```

### Issue 3: "Engine did not respond"

**Fix:**
1. Test Stockfish manually:
   ```bash
   # Windows
   D:\path\to\stockfish.exe
   
   # Type: uci
   # Should see: uciok
   # Type: quit
   ```
2. If Stockfish doesn't respond, download a new binary from https://stockfishchess.org/download/

### Issue 4: Backend crashes immediately

**Check backend logs** for error details. Common causes:
- Missing Python packages: `pip install fastapi uvicorn python-chess python-dotenv`
- Invalid .env file
- Antivirus blocking Stockfish

---

## Still Not Working?

1. **Check backend logs** - The terminal running `uvicorn` shows all errors
2. **Check browser console** (F12) - Shows frontend errors
3. **Check backend server is responding:**
   ```bash
   curl http://localhost:8000/health
   ```
4. **Try temporary engine** instead of persistent:
   - Stop the backend
   - Remove or comment out the `/start_engine` call in frontend
   - Backend will use temporary engines (slower but works)

---

## Clean Restart

If all else fails:

```bash
# 1. Kill all Python processes
# Windows: taskkill /F /IM python.exe
# Linux/Mac: pkill -9 python

# 2. Kill all Stockfish processes  
# Windows: taskkill /F /IM stockfish.exe
# Linux/Mac: pkill -9 stockfish

# 3. Restart backend
cd chess-api
uvicorn app:app --reload --host 0.0.0.0 --port 8000

# 4. In another terminal, test it
curl -X POST http://localhost:8000/start_engine

# 5. Refresh frontend browser page
```

---

## Success Indicators

When everything works, you'll see:

**Backend terminal:**
```
INFO:app:Starting Stockfish engine from: D:/path/to/stockfish.exe
INFO:app:Stockfish engine initialized successfully
INFO:app:Stockfish engine started successfully (Hash=512MB, Threads=4)
```

**Browser console:**
```
✅ Backend Stockfish initialized successfully
  🔧 Engine: D:/path/to/stockfish.exe
```

**Analysis screen:**
- Makes moves without errors
- Shows evaluation bar
- Shows engine lines
- Classifies moves

---

## Get More Help

If you're still stuck:
1. Share the **backend terminal output** (errors)
2. Share the **browser console output** (F12 → Console tab)
3. Share the output of `python diagnose.py`

