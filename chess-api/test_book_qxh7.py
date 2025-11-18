# test_book_qxh7.py
from opening_book import is_book_move
import chess

FEN = "rn3rk1/pbppq1pQ/1p2pb2/4N3/3PN3/3B4/PPP2PPP/R3K2R b KQ - 0 1"  # make sure this matches your pre-move FEN exactly


FEN2 = "rn3rk1/pbppq1pp/1p2pb2/4N2Q/3PN3/3B4/PPP2PPP/R3K2R w KQ - 0 1"
MOVE = "h5h7"

print("is_book_move:", is_book_move(FEN2, MOVE))
