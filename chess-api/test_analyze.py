#!/usr/bin/env python3
"""
Test script for /analyze endpoint

Usage:
    python test_analyze.py
"""

import requests
import json

API_BASE_URL = "http://localhost:8000"

def test_analyze():
    """Test the /analyze endpoint with a standard chess position"""
    
    print("🧪 Testing /analyze endpoint...")
    print("-" * 60)
    
    # Test 1: Starting position
    print("\n📋 Test 1: Starting position")
    test_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    
    data = {
        'fen': test_fen,
        'depth': 15,
        'multipv': 3
    }
    
    try:
        response = requests.post(f"{API_BASE_URL}/analyze", data=data)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Status: {response.status_code}")
            print(f"✅ Evaluation: {result.get('evaluation')}")
            print(f"✅ Best Move: {result.get('bestMove')}")
            print(f"✅ Lines Count: {len(result.get('lines', []))}")
            print(f"✅ Depth: {result.get('depth')}")
            
            # Print first line details
            if result.get('lines'):
                line1 = result['lines'][0]
                print(f"\n📊 First Line:")
                print(f"   MultiPV: {line1.get('multipv')}")
                print(f"   CP: {line1.get('cp')}")
                print(f"   Mate: {line1.get('mate')}")
                print(f"   PV: {' '.join(line1.get('pv', [])[:5])}...")
                if line1.get('pvSan'):
                    print(f"   PV (SAN): {line1.get('pvSan')[:50]}...")
            
            print("\n✅ Test 1 PASSED")
        else:
            print(f"❌ Status: {response.status_code}")
            print(f"❌ Response: {response.text}")
            print("\n❌ Test 1 FAILED")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\n❌ Test 1 FAILED")
        return False
    
    # Test 2: Middle game position
    print("\n" + "-" * 60)
    print("📋 Test 2: Middle game position (after 1.e4 e5 2.Nf3 Nc6)")
    test_fen2 = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"
    
    data2 = {
        'fen': test_fen2,
        'depth': 18,
        'multipv': 5
    }
    
    try:
        response = requests.post(f"{API_BASE_URL}/analyze", data=data2)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Status: {response.status_code}")
            print(f"✅ Evaluation: {result.get('evaluation')}")
            print(f"✅ Best Move: {result.get('bestMove')}")
            print(f"✅ Lines Count: {len(result.get('lines', []))}")
            
            print("\n✅ Test 2 PASSED")
        else:
            print(f"❌ Status: {response.status_code}")
            print(f"❌ Response: {response.text}")
            print("\n❌ Test 2 FAILED")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\n❌ Test 2 FAILED")
        return False
    
    # Test 3: Invalid FEN (should return 400)
    print("\n" + "-" * 60)
    print("📋 Test 3: Invalid FEN (should return 400)")
    
    data3 = {
        'fen': 'invalid-fen-string',
        'depth': 10,
        'multipv': 1
    }
    
    try:
        response = requests.post(f"{API_BASE_URL}/analyze", data=data3)
        
        if response.status_code == 400:
            result = response.json()
            print(f"✅ Status: {response.status_code} (expected)")
            print(f"✅ Error: {result.get('error')}")
            print(f"✅ Message: {result.get('message')}")
            print("\n✅ Test 3 PASSED")
        else:
            print(f"❌ Expected 400, got {response.status_code}")
            print("\n❌ Test 3 FAILED")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\n❌ Test 3 FAILED")
        return False
    
    print("\n" + "=" * 60)
    print("✅ ALL TESTS PASSED!")
    print("=" * 60)
    return True

def test_engine_status():
    """Test the /engine_status endpoint"""
    print("\n🔍 Checking engine status...")
    
    try:
        response = requests.get(f"{API_BASE_URL}/engine_status")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Engine Running: {result.get('running')}")
            print(f"✅ Engine Path: {result.get('engine_path')}")
            print(f"✅ Engine Exists: {result.get('engine_exists')}")
            
            if not result.get('running'):
                print("\n⚠️  Engine not running. Starting engine...")
                start_response = requests.post(f"{API_BASE_URL}/start_engine")
                if start_response.status_code == 200:
                    print("✅ Engine started successfully")
                else:
                    print(f"❌ Failed to start engine: {start_response.text}")
                    return False
        else:
            print(f"❌ Failed to get engine status: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    return True

if __name__ == "__main__":
    print("🚀 Backend Stockfish Endpoint Test")
    print("=" * 60)
    
    # Check if server is running
    try:
        response = requests.get(f"{API_BASE_URL}/health")
        if response.status_code != 200:
            print(f"❌ Backend not responding at {API_BASE_URL}")
            print("   Make sure the FastAPI server is running:")
            print("   cd chess-api && uvicorn app:app --reload --port 8000")
            exit(1)
        print(f"✅ Backend is running at {API_BASE_URL}")
    except Exception as e:
        print(f"❌ Cannot connect to backend at {API_BASE_URL}")
        print(f"   Error: {e}")
        print("\n   Make sure the FastAPI server is running:")
        print("   cd chess-api && uvicorn app:app --reload --port 8000")
        exit(1)
    
    # Test engine status and start if needed
    if not test_engine_status():
        exit(1)
    
    # Run analysis tests
    if test_analyze():
        print("\n🎉 All tests completed successfully!")
        exit(0)
    else:
        print("\n💥 Some tests failed. Check the output above.")
        exit(1)

