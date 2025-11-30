#!/usr/bin/env python3
"""
Convert Polyglot opening book (.bin) to JSON format for browser use
"""

import chess
import chess.polyglot
import json
from collections import defaultdict

def convert_book_to_json(bin_path, json_path, max_entries=50000):
    """
    Convert polyglot book to JSON format

    Args:
        bin_path: Path to .bin file (e.g., "engine/gm2001.bin")
        json_path: Output path for .json file
        max_entries: Maximum positions to include (to keep file size manageable)
    """
    print(f"📖 Converting {bin_path} to JSON...")

    try:
        book = chess.polyglot.open_reader(bin_path)
    except FileNotFoundError:
        print(f"❌ Book file not found at: {bin_path}")
        return False

    # Dictionary to store: FEN -> [list of UCI moves]
    book_dict = defaultdict(list)

    # Track how many entries we've processed
    entry_count = 0
    position_count = 0

    # Read all entries from the book
    for entry in book:
        # Get the board position from the entry's Zobrist key
        # We need to reconstruct the position
        # For simplicity, we'll use a different approach:
        # Store by position FEN (without move counters)

        # Create board and get FEN
        board = chess.Board()

        # The polyglot entry has a key (zobrist hash)
        # We need to map this to a FEN
        # For now, let's use a simpler approach: iterate through common positions

        entry_count += 1

        if entry_count > max_entries:
            print(f"⚠️ Reached max entries ({max_entries}), stopping...")
            break

    book.close()

    # Alternative approach: Build book by playing through moves
    print("📝 Building book by exploring positions...")
    book = chess.polyglot.open_reader(bin_path)

    # Start from initial position
    positions_to_explore = [chess.Board()]
    explored = set()
    book_dict = {}

    while positions_to_explore and len(book_dict) < max_entries:
        board = positions_to_explore.pop(0)

        # Get FEN key (without move counters for matching)
        fen_parts = board.fen().split(' ')
        fen_key = ' '.join(fen_parts[:4])  # position, turn, castling, en passant

        if fen_key in explored:
            continue

        explored.add(fen_key)

        # Check if this position is in the book
        try:
            book_moves = []
            for entry in book.find_all(board):
                move_uci = entry.move.uci()
                book_moves.append(move_uci)

                # Add resulting position to explore
                new_board = board.copy()
                new_board.push(entry.move)

                # Only explore first 15 moves (opening phase)
                if new_board.fullmove_number <= 15:
                    positions_to_explore.append(new_board)

            if book_moves:
                book_dict[fen_key] = book_moves
                if len(book_dict) % 100 == 0:
                    print(f"  Processed {len(book_dict)} positions...")

        except Exception as e:
            # Skip positions that cause errors
            pass

    book.close()

    print(f"✅ Found {len(book_dict)} positions in book")

    # Save to JSON
    print(f"💾 Saving to {json_path}...")
    with open(json_path, 'w') as f:
        json.dump(book_dict, f, indent=2)

    # Print file size
    import os
    size_kb = os.path.getsize(json_path) / 1024
    print(f"✅ Saved {len(book_dict)} positions ({size_kb:.1f} KB)")

    # Print some examples
    print("\n📋 Sample entries:")
    for i, (fen, moves) in enumerate(list(book_dict.items())[:5]):
        print(f"  {i+1}. {fen}")
        print(f"     Moves: {', '.join(moves)}")

    return True


if __name__ == "__main__":
    # Paths
    BIN_PATH = "engine/gm2001.bin"
    JSON_PATH = "chess-web-scan/public/opening_book.json"

    print("=" * 60)
    print("Opening Book Converter")
    print("=" * 60)

    success = convert_book_to_json(BIN_PATH, JSON_PATH, max_entries=10000)

    if success:
        print("\n" + "=" * 60)
        print("✅ Conversion complete!")
        print("=" * 60)
        print(f"\nThe book is now ready at:")
        print(f"  {JSON_PATH}")
        print("\nYour web app will automatically use it.")
    else:
        print("\n❌ Conversion failed")
