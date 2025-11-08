# Map YOLO class names to FEN letters
LABEL_TO_FEN = {
"wP": "P", "wN": "N", "wB": "B", "wR": "R", "wQ": "Q", "wK": "K",
"bP": "p", "bN": "n", "bB": "b", "bR": "r", "bQ": "q", "bK": "k",
}


# If your pieces dataset has indices like 0..11 instead of names, set them here
# in the exact order used during training (from data/pieces/dataset.yaml)
INDEX_TO_NAME = [
"bB","bK","bN","bP","bQ","bR","wB","wK","wN","wP","wQ","wR"
]