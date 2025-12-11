"""
Script to create admin user in the database
Run this once to create the admin account
"""
import sys
from database import create_user, get_user_by_username
from auth import hash_password

def create_admin_user():
    """Create admin user if it doesn't exist"""
    username = "admin"
    password = "admin123"
    email = "admin@chessdetector.local"

    # Check if admin already exists
    existing_user = get_user_by_username(username)
    if existing_user:
        print(f"[ERROR] Admin user already exists!")
        print(f"   Username: {username}")
        print(f"   Created at: {existing_user['created_at']}")
        return False

    # Hash password
    password_hash = hash_password(password)

    # Create admin user
    try:
        user_id = create_user(
            username=username,
            email=email,
            password_hash=password_hash,
            signup_ip="127.0.0.1"
        )

        print("[SUCCESS] Admin user created successfully!")
        print(f"   User ID: {user_id}")
        print(f"   Username: {username}")
        print(f"   Password: {password}")
        print(f"   Email: {email}")
        print("\n[WARNING] IMPORTANT: Please change the admin password after first login!")
        return True

    except Exception as e:
        print(f"[ERROR] Error creating admin user: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Creating Admin User for Chess Detector")
    print("=" * 60)
    print()

    success = create_admin_user()

    print()
    print("=" * 60)
    sys.exit(0 if success else 1)
