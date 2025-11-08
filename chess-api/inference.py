from __future__ import annotations
import io
import os
import math
import cv2
import numpy as np
from PIL import Image
from ultralytics import YOLO
from labels import LABEL_TO_FEN, INDEX_TO_NAME


WARP_SIZE = 1024 # square warp size


class Detector:
    def __init__(self, board_model_path: str, pieces_model_path: str, board_conf: float=0.25, pieces_conf: float=0.25):
        self.board_model = YOLO(board_model_path)
        self.pieces_model = YOLO(pieces_model_path)
        self.board_conf = float(board_conf)
        self.pieces_conf = float(pieces_conf)


    @staticmethod
    def _pil_to_bgr(img: Image.Image) -> np.ndarray:
        return cv2.cvtColor(np.array(img.convert('RGB')), cv2.COLOR_RGB2BGR)


    @staticmethod
    def _order_quad(pts: np.ndarray) -> np.ndarray:
        # pts: (4,2) unordered; return TL, TR, BR, BL
        s = pts.sum(axis=1)
        diff = np.diff(pts, axis=1).reshape(-1)
        tl = pts[np.argmin(s)]
        br = pts[np.argmax(s)]
        tr = pts[np.argmin(diff)]
        bl = pts[np.argmax(diff)]
        return np.array([tl, tr, br, bl], dtype=np.float32)


    def find_and_warp_board(self, bgr: np.ndarray):
        # Run segmentation; take best mask for class 'board'
        res = self.board_model.predict(source=bgr, conf=self.board_conf, verbose=False)[0]
        if res.masks is None or len(res.masks) == 0:
            raise RuntimeError("No board mask detected.")
        # choose largest-area mask
        areas = [mask_data.cpu().numpy().sum() for mask_data in res.masks.data]
        idx = int(np.argmax(areas))
        mask = res.masks.data[idx].cpu().numpy() # (H_mask, W_mask) 0/1
        
        # Resize mask to original image dimensions
        h, w = bgr.shape[:2]
        mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
        mask = (mask > 0.5).astype(np.uint8)  # Binarize after resize


        # get quadrilateral from mask contour via approxPolyDP
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            raise RuntimeError("No contours for board mask.")
        cnt = max(cnts, key=cv2.contourArea)
        epsilon = 0.02 * cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, epsilon, True)
        if len(approx) < 4:
            # fallback to minAreaRect
            rect = cv2.minAreaRect(cnt)
            box = cv2.boxPoints(rect)
        else:
            # pick 4 farthest points via convex hull if >4
            hull = cv2.convexHull(approx)
            if len(hull) > 4:
                # sample 4 corners by k-means on angle or just use boxPoints of minAreaRect
                rect = cv2.minAreaRect(cnt)
                box = cv2.boxPoints(rect)
            else:
                box = hull.reshape(-1, 2)
        if box.shape[0] != 4:
            rect = cv2.minAreaRect(cnt)
            box = cv2.boxPoints(rect)
        box = self._order_quad(box.astype(np.float32))


        dst = np.array([[0,0],[WARP_SIZE-1,0],[WARP_SIZE-1,WARP_SIZE-1],[0,WARP_SIZE-1]], dtype=np.float32)
        M = cv2.getPerspectiveTransform(box, dst)
        warped = cv2.warpPerspective(bgr, M, (WARP_SIZE, WARP_SIZE))
        return warped, box, M


    def detect_pieces(self, warped_bgr: np.ndarray):
        """
        Detect pieces on the warped board image.
        Returns list of detections with class names and bounding boxes.
        """
        res = self.pieces_model.predict(source=warped_bgr, conf=self.pieces_conf, verbose=False)[0]
        detections = []
        if res.boxes is not None and len(res.boxes) > 0:
            for box in res.boxes:
                cls_idx = int(box.cls[0])
                conf = float(box.conf[0])
                xyxy = box.xyxy[0].cpu().numpy()
                x1, y1, x2, y2 = xyxy
                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2
                
                # Get class name
                if cls_idx < len(INDEX_TO_NAME):
                    cls_name = INDEX_TO_NAME[cls_idx]
                else:
                    cls_name = f"class_{cls_idx}"
                
                detections.append({
                    "class": cls_name,
                    "conf": conf,
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "center": [float(cx), float(cy)]
                })
        return detections


    def _detections_to_fen(self, detections, flip_ranks: bool = False):
        """
        Convert piece detections to FEN notation.
        Assumes board is warped to WARP_SIZE x WARP_SIZE.
        """
        square_size = WARP_SIZE / 8
        board = [["" for _ in range(8)] for _ in range(8)]
        
        for det in detections:
            cx, cy = det["center"]
            file_idx = int(cx / square_size)
            rank_idx = int(cy / square_size)
            
            # Clamp to valid range
            file_idx = max(0, min(7, file_idx))
            rank_idx = max(0, min(7, rank_idx))
            
            # Get FEN character
            cls_name = det["class"]
            fen_char = LABEL_TO_FEN.get(cls_name, "?")
            
            if fen_char != "?":
                board[rank_idx][file_idx] = fen_char
        
        # Convert board to FEN
        fen_rows = []
        for rank_idx in range(8):
            if flip_ranks:
                rank = board[rank_idx]
            else:
                rank = board[7 - rank_idx]
            
            fen_row = ""
            empty_count = 0
            for square in rank:
                if square == "":
                    empty_count += 1
                else:
                    if empty_count > 0:
                        fen_row += str(empty_count)
                        empty_count = 0
                    fen_row += square
            if empty_count > 0:
                fen_row += str(empty_count)
            fen_rows.append(fen_row)
        
        return "/".join(fen_rows)


    def _draw_overlay(self, warped_bgr: np.ndarray, detections):
        """
        Draw bounding boxes on the warped board image.
        Returns PNG bytes.
        """
        overlay = warped_bgr.copy()
        
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            cls_name = det["class"]
            conf = det["conf"]
            
            # Draw rectangle
            color = (0, 255, 0)  # Green
            cv2.rectangle(overlay, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
            
            # Draw label
            label = f"{cls_name} {conf:.2f}"
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.5
            thickness = 1
            (text_w, text_h), _ = cv2.getTextSize(label, font, font_scale, thickness)
            
            cv2.rectangle(overlay, (int(x1), int(y1) - text_h - 4), 
                         (int(x1) + text_w, int(y1)), color, -1)
            cv2.putText(overlay, label, (int(x1), int(y1) - 2), 
                       font, font_scale, (0, 0, 0), thickness)
        
        # Convert to PNG bytes
        _, buffer = cv2.imencode('.png', overlay)
        return buffer.tobytes()


    def run(self, image: Image.Image, flip_ranks: bool = False):
        """
        Main inference pipeline.
        Returns (result_dict, overlay_png_bytes).
        """
        # Convert PIL to BGR
        bgr = self._pil_to_bgr(image)
        
        # Find and warp board
        warped, quad, transform = self.find_and_warp_board(bgr)
        
        # Detect pieces
        detections = self.detect_pieces(warped)
        
        # Convert to FEN
        fen = self._detections_to_fen(detections, flip_ranks=flip_ranks)
        
        # Draw overlay
        overlay_png = self._draw_overlay(warped, detections)
        
        result = {
            "fen": fen,
            "num_pieces": len(detections),
            "detections": detections
        }
        
        return result, overlay_png
