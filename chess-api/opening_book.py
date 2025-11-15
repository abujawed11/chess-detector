# opening_book.py

import os
import chess
import chess.polyglot

# Path to your polyglot book file
# Adjust this path if your book is in a different location
BOOK_PATH = os.path.join(os.path.dirname(__file__), "..", "engine", "book.bin")

# Cache the book object
_book = None


def get_book():
    """
    Loads and caches the polyglot book.
    Logs everything so you know if the real book is being used.
    """
    global _book

    print(f"[OPENING_BOOK] TRYING TO LOAD BOOK FROM: {BOOK_PATH}")

    if _book is None:
        if not os.path.exists(BOOK_PATH):
            print(f"[OPENING_BOOK] ❌ Book file NOT FOUND at: {BOOK_PATH}")
            _book = None
        else:
            try:
                print(f"[OPENING_BOOK] ✅ Loading polyglot book...")
                _book = chess.polyglot.MemoryMappedReader(BOOK_PATH)
                print(f"[OPENING_BOOK] ✅ Book loaded successfully!")
            except Exception as e:
                print(f"[OPENING_BOOK] ❌ Failed to load book: {e}")
                _book = None

    return _book


def is_book_move(fen: str, uci_move: str) -> bool:
    """
    Return True if this (FEN, move) pair appears in the Polyglot opening book.

    - fen: full FEN string of the PRE-move position
    - uci_move: move in UCI format, e.g. "e2e4"
    """

    book = get_book()
    if book is None:
        print("[OPENING_BOOK] ⚠️ Book not loaded; treating as NOT book move.")
        return False

    board = chess.Board(fen)
    move = chess.Move.from_uci(uci_move)

    print(f"\n[OPENING_BOOK] ------------------------------")
    print(f"[OPENING_BOOK] Checking FEN:")
    print(f"{fen}")
    print(f"[OPENING_BOOK] Checking move: {uci_move}")
    print(f"[OPENING_BOOK] ------------------------------")

    try:
        found_any_entry = False

        for entry in book.find_all(board):
            found_any_entry = True
            entry_move = entry.move.uci()
            print(f"[OPENING_BOOK] Found book move in DB: {entry_move}")

            if entry.move == move:
                print(f"[OPENING_BOOK] 🎉 MATCH! This move IS in the opening book.")
                return True

        if not found_any_entry:
            print(f"[OPENING_BOOK] No book entries found for this position.")
        else:
            print(f"[OPENING_BOOK] ❌ No match for move {uci_move} in book entries.")

        return False

    except Exception as e:
        print(f"[OPENING_BOOK] ❌ Error scanning book: {e}")
        return False
