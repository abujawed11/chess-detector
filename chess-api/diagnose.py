#!/usr/bin/env python3
"""
Quick diagnostic script to check Stockfish setup
Run this before starting the server to ensure everything is configured correctly
"""

import os
import sys
import subprocess
from pathlib import Path

def check_stockfish_path():
    """Check if Stockfish path is configured and exists"""
    print(">> Checking Stockfish configuration...")
    print("-" * 60)
    
    # Check environment variable
    stockfish_path = os.getenv("STOCKFISH_PATH")
    
    if not stockfish_path:
        print("[FAIL] STOCKFISH_PATH environment variable not set!")
        print("\nTo fix:")
        print("   1. Create/edit chess-api/.env file")
        print("   2. Add: STOCKFISH_PATH=/path/to/stockfish")
        print("   3. On Windows: STOCKFISH_PATH=C:\\path\\to\\stockfish.exe")
        return False
    
    print(f"[OK] STOCKFISH_PATH is set: {stockfish_path}")
    
    # Check if file exists
    if not os.path.exists(stockfish_path):
        print(f"[FAIL] Stockfish binary not found at: {stockfish_path}")
        print("\nTo fix:")
        print("   1. Download Stockfish from https://stockfishchess.org/download/")
        print("   2. Extract the binary")
        print("   3. Update STOCKFISH_PATH in .env to point to the binary")
        return False
    
    print(f"[OK] Stockfish binary exists")
    
    # Check if executable (skip on Windows)
    if sys.platform != 'win32':
        if not os.access(stockfish_path, os.X_OK):
            print(f"[FAIL] Stockfish binary is not executable!")
            print(f"\nTo fix:")
            print(f"   chmod +x {stockfish_path}")
            return False
        print(f"[OK] Stockfish binary is executable")
    
    # Try to run it
    try:
        print(f"\n>> Testing Stockfish communication...")
        
        proc_args = {
            'stdin': subprocess.PIPE,
            'stdout': subprocess.PIPE,
            'stderr': subprocess.PIPE,
            'universal_newlines': True,
        }
        
        # Windows-specific flag
        if sys.platform == 'win32':
            proc_args['creationflags'] = subprocess.CREATE_NO_WINDOW
        
        proc = subprocess.Popen([stockfish_path], **proc_args)
        
        # Send UCI command
        proc.stdin.write("uci\n")
        proc.stdin.flush()
        
        # Read response
        uci_ok = False
        for i in range(100):  # Read up to 100 lines
            line = proc.stdout.readline().strip()
            if "uciok" in line:
                uci_ok = True
                break
        
        # Clean up
        proc.stdin.write("quit\n")
        proc.stdin.flush()
        proc.wait(timeout=2)
        
        if uci_ok:
            print("[OK] Stockfish responds to UCI commands")
            print("\n" + "=" * 60)
            print("SUCCESS: All checks passed! Stockfish is properly configured.")
            print("=" * 60)
            return True
        else:
            print("[FAIL] Stockfish did not respond with 'uciok'")
            return False
            
    except Exception as e:
        print(f"[FAIL] Error testing Stockfish: {e}")
        return False

def check_python_dependencies():
    """Check if required Python packages are installed"""
    print("\n>> Checking Python dependencies...")
    print("-" * 60)
    
    required = ['fastapi', 'uvicorn', 'python-chess', 'python-dotenv']
    missing = []
    
    for package in required:
        try:
            # Handle package name differences
            import_name = package.replace('-', '_')
            if package == 'python-chess':
                import_name = 'chess'
            
            __import__(import_name)
            print(f"[OK] {package} installed")
        except ImportError:
            print(f"[FAIL] {package} NOT installed")
            missing.append(package)
    
    if missing:
        print(f"\nTo fix, install missing packages:")
        print(f"   pip install {' '.join(missing)}")
        return False
    
    return True

def check_port():
    """Check if port 8000 is available"""
    print("\n>> Checking port availability...")
    print("-" * 60)
    
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('localhost', 8000))
    sock.close()
    
    if result == 0:
        print("[INFO] Port 8000 is already in use")
        print("       This is OK if your server is already running")
        print("       If not, another process is using port 8000")
        return True
    else:
        print("[OK] Port 8000 is available")
        return True

if __name__ == "__main__":
    print("=" * 60)
    print("Chess Backend Diagnostic Tool")
    print("=" * 60)
    
    # Load .env if it exists
    try:
        from dotenv import load_dotenv
        env_path = Path(__file__).parent / '.env'
        if env_path.exists():
            load_dotenv(env_path)
            print(f"[OK] Loaded environment from: {env_path}")
        else:
            print(f"[WARN] No .env file found at: {env_path}")
            print("       Create one with STOCKFISH_PATH=/path/to/stockfish")
    except ImportError:
        print("[WARN] python-dotenv not installed, using system environment")
    
    print()
    
    # Run all checks
    checks = [
        ("Python Dependencies", check_python_dependencies),
        ("Stockfish Configuration", check_stockfish_path),
        ("Port Availability", check_port),
    ]
    
    all_passed = True
    for name, check_func in checks:
        if not check_func():
            all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("SUCCESS: ALL CHECKS PASSED!")
        print("\nYou can now start the server:")
        print("   uvicorn app:app --reload --host 0.0.0.0 --port 8000")
    else:
        print("ERROR: SOME CHECKS FAILED")
        print("\nFix the issues above before starting the server.")
    print("=" * 60)
    
    sys.exit(0 if all_passed else 1)
