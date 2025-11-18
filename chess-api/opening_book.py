# opening_book.py

import os
import chess
import chess.polyglot

# Path to your polyglot book file
# Adjust this path if your book is in a different location
BOOK_PATH = os.path.join(os.path.dirname(__file__), "..", "engine", "gm2001.bin")

# Cache the book object
_book = None


def get_book():
    """
    Loads and caches the polyglot book.
    Logs everything so you know if the real book is being used.
    """
    global _book

    if _book is None:
        print(f"[OPENING_BOOK] Loading book from: {BOOK_PATH}")

        if not os.path.exists(BOOK_PATH):
            print(f"[OPENING_BOOK] ❌ Book file NOT FOUND at: {BOOK_PATH}")
            return None

        try:
            _book = chess.polyglot.MemoryMappedReader(BOOK_PATH)
            print(f"[OPENING_BOOK] ✅ Book loaded successfully ({os.path.getsize(BOOK_PATH) / (1024*1024):.1f} MB)")
        except Exception as e:
            print(f"[OPENING_BOOK] ❌ Failed to load book: {e}")
            _book = None

    return _book


def is_book_move(fen: str, uci_move: str) -> bool:
    book = get_book()
    if book is None:
        print(f"[OPENING_BOOK] is_book_move: book missing → False")
        return False

    try:
        board = chess.Board(fen)
        move = chess.Move.from_uci(uci_move)

        for entry in book.find_all(board):
            if entry.move == move:
                print(f"[OPENING_BOOK] is_book_move({uci_move}) = True for FEN:")
                print(f"  {fen}")
                return True

        print(f"[OPENING_BOOK] is_book_move({uci_move}) = False for FEN:")
        print(f"  {fen}")
        return False

    except Exception as e:
        print(f"[OPENING_BOOK] ❌ Error checking move {uci_move}: {e}")
        return False




# def is_book_move(fen: str, uci_move: str) -> bool:
#     """
#     Return True if this (FEN, move) pair appears in the Polyglot opening book.

#     - fen: full FEN string of the PRE-move position
#     - uci_move: move in UCI format, e.g. "e2e4"
#     """
#     book = get_book()
#     if book is None:
#         return False

#     try:
#         board = chess.Board(fen)
#         move = chess.Move.from_uci(uci_move)

#         # Check if move is in book for this position
#         for entry in book.find_all(board):
#             if entry.move == move:
#                 return True

#         return False

#     except Exception as e:
#         print(f"[OPENING_BOOK] ❌ Error checking move {uci_move}: {e}")
#         return False
