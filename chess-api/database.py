import sqlite3
import os
import hashlib
from contextlib import contextmanager
from datetime import datetime, timedelta

# Database file path
DB_PATH = os.path.join(os.path.dirname(__file__), "chess_users.db")

def hash_ip(ip: str) -> str:
    """Hash IP address for privacy"""
    return hashlib.sha256(ip.encode()).hexdigest()

def migrate_database():
    """Run database migrations to add new columns/tables"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Check if signup_ip column exists in users table
        cursor.execute("PRAGMA table_info(users)")
        columns = [row[1] for row in cursor.fetchall()]

        if 'signup_ip' not in columns:
            print("🔄 Running migration: Adding signup_ip column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN signup_ip TEXT")
            conn.commit()
            print("✅ Migration complete: signup_ip column added")
        else:
            print("✓ signup_ip column already exists")

    except Exception as e:
        print(f"⚠️ Migration error: {e}")
    finally:
        conn.close()

def init_db():
    """Initialize the database and create tables if they don't exist"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create users table (without signup_ip initially for compatibility)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create IP usage tracking table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ip_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_hash TEXT UNIQUE NOT NULL,
            usage_count INTEGER DEFAULT 0,
            first_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()
    print(f"✅ Database initialized at {DB_PATH}")

    # Run migrations after initial table creation
    migrate_database()

@contextmanager
def get_db():
    """Context manager for database connections"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Enable column access by name
    try:
        yield conn
    finally:
        conn.close()

def create_user(username: str, email: str, password_hash: str, signup_ip: str = None):
    """Create a new user in the database"""
    with get_db() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO users (username, email, password_hash, signup_ip) VALUES (?, ?, ?, ?)",
                (username, email, password_hash, signup_ip)
            )
            conn.commit()
            return cursor.lastrowid
        except sqlite3.IntegrityError as e:
            if "username" in str(e):
                raise ValueError("Username already exists")
            elif "email" in str(e):
                raise ValueError("Email already exists")
            else:
                raise ValueError("User creation failed")

def get_user_by_username(username: str):
    """Get user by username"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        return cursor.fetchone()

def get_user_by_email(email: str):
    """Get user by email"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        return cursor.fetchone()

def get_user_by_id(user_id: int):
    """Get user by ID"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return cursor.fetchone()

# ============= IP Usage Tracking Functions =============

def get_ip_usage(ip: str):
    """Get usage count for an IP address"""
    ip_hash_val = hash_ip(ip)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM ip_usage WHERE ip_hash = ?", (ip_hash_val,))
        return cursor.fetchone()

def increment_ip_usage(ip: str):
    """Increment usage count for an IP address"""
    ip_hash_val = hash_ip(ip)
    with get_db() as conn:
        cursor = conn.cursor()

        # Check if IP exists
        cursor.execute("SELECT usage_count FROM ip_usage WHERE ip_hash = ?", (ip_hash_val,))
        result = cursor.fetchone()

        if result:
            # Update existing record
            new_count = result['usage_count'] + 1
            cursor.execute(
                "UPDATE ip_usage SET usage_count = ?, last_used = ? WHERE ip_hash = ?",
                (new_count, datetime.utcnow(), ip_hash_val)
            )
        else:
            # Create new record
            cursor.execute(
                "INSERT INTO ip_usage (ip_hash, usage_count, first_used, last_used) VALUES (?, ?, ?, ?)",
                (ip_hash_val, 1, datetime.utcnow(), datetime.utcnow())
            )

        conn.commit()
        return cursor.execute("SELECT usage_count FROM ip_usage WHERE ip_hash = ?", (ip_hash_val,)).fetchone()['usage_count']

def clear_ip_usage(ip: str):
    """Clear usage limit for an IP (called when user signs up/logs in)"""
    ip_hash_val = hash_ip(ip)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM ip_usage WHERE ip_hash = ?", (ip_hash_val,))
        conn.commit()

def check_ip_limit(ip: str, max_usage: int = 5) -> tuple[bool, int]:
    """
    Check if IP has exceeded usage limit
    Returns: (is_allowed, remaining_uses)
    """
    ip_hash_val = hash_ip(ip)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT usage_count FROM ip_usage WHERE ip_hash = ?", (ip_hash_val,))
        result = cursor.fetchone()

        if not result:
            # First time user
            return (True, max_usage)

        usage_count = result['usage_count']
        remaining = max(0, max_usage - usage_count)
        is_allowed = usage_count < max_usage

        return (is_allowed, remaining)
