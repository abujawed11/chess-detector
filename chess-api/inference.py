from __future__ import annotations
import io
import os
import math
import cv2
import numpy as np
from PIL import Image
from ultralytics import YOLO
from labels import LABEL_TO_FEN, INDEX_TO_NAME


WARP_SIZE = 2048 # square warp size - larger for better visualization


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
        mask = (mask > 0.5).astype(np.uint8) * 255  # Binarize and scale to 0-255
        
        # Clean up mask with morphological operations
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

        # get quadrilateral from mask contour
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            raise RuntimeError("No contours for board mask.")
        cnt = max(cnts, key=cv2.contourArea)
        
        # Use convex hull to simplify
        hull = cv2.convexHull(cnt)
        
        # Try different epsilon values to get exactly 4 points
        box = None
        for epsilon_factor in [0.01, 0.02, 0.03, 0.04, 0.05]:
            epsilon = epsilon_factor * cv2.arcLength(hull, True)
            approx = cv2.approxPolyDP(hull, epsilon, True)
            if len(approx) == 4:
                box = approx.reshape(-1, 2)
                break
        
        # If we still don't have 4 points, find the 4 extreme corners
        if box is None or len(box) != 4:
            # Get convex hull points
            hull_points = hull.reshape(-1, 2)
            
            # Find the 4 corners by finding extreme points
            # This method finds the most distant points from the center
            center = hull_points.mean(axis=0)
            angles = np.arctan2(hull_points[:, 1] - center[1], 
                               hull_points[:, 0] - center[0])
            
            # Sort by angle and pick 4 points at roughly 90-degree intervals
            sorted_indices = np.argsort(angles)
            sorted_points = hull_points[sorted_indices]
            
            # Sample 4 points evenly distributed by angle
            n = len(sorted_points)
            indices = [int(i * n / 4) for i in range(4)]
            box = sorted_points[indices]
        
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
        board_conf = [[0.0 for _ in range(8)] for _ in range(8)]  # Track confidence per square
        
        # Sort detections by confidence (highest first)
        sorted_dets = sorted(detections, key=lambda d: d["conf"], reverse=True)
        
        for det in sorted_dets:
            cx, cy = det["center"]
            file_idx = int(cx / square_size)
            rank_idx = int(cy / square_size)
            
            # Clamp to valid range
            file_idx = max(0, min(7, file_idx))
            rank_idx = max(0, min(7, rank_idx))
            
            # Get FEN character
            cls_name = det["class"]
            fen_char = LABEL_TO_FEN.get(cls_name, "?")
            
            # Only place piece if this square is empty or current detection has higher confidence
            if fen_char != "?" and det["conf"] > board_conf[rank_idx][file_idx]:
                board[rank_idx][file_idx] = fen_char
                board_conf[rank_idx][file_idx] = det["conf"]
        
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
        Draw bounding boxes and grid on the warped board image.
        Returns PNG bytes.
        """
        overlay = warped_bgr.copy()
        
        # Draw 8x8 grid for reference
        square_size = WARP_SIZE / 8
        grid_color = (200, 200, 200)  # Light gray
        for i in range(9):
            pos = int(i * square_size)
            cv2.line(overlay, (pos, 0), (pos, WARP_SIZE), grid_color, 1)
            cv2.line(overlay, (0, pos), (WARP_SIZE, pos), grid_color, 1)
        
        # Draw detections
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            cls_name = det["class"]
            conf = det["conf"]
            cx, cy = det["center"]
            
            # Calculate which square this piece is in
            file_idx = int(cx / square_size)
            rank_idx = int(cy / square_size)
            file_idx = max(0, min(7, file_idx))
            rank_idx = max(0, min(7, rank_idx))
            files = 'abcdefgh'
            square_name = f"{files[file_idx]}{8-rank_idx}"
            
            # Draw rectangle
            color = (0, 255, 0)  # Green
            cv2.rectangle(overlay, (int(x1), int(y1)), (int(x2), int(y2)), color, 3)
            
            # Draw center point
            cv2.circle(overlay, (int(cx), int(cy)), 5, (255, 0, 0), -1)
            
            # Draw label with square info
            label = f"{cls_name}@{square_name} {conf:.2f}"
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.8
            thickness = 2
            (text_w, text_h), baseline = cv2.getTextSize(label, font, font_scale, thickness)
            
            # Background for text
            cv2.rectangle(overlay, (int(x1), int(y1) - text_h - baseline - 4), 
                         (int(x1) + text_w + 4, int(y1)), color, -1)
            cv2.putText(overlay, label, (int(x1) + 2, int(y1) - baseline - 2), 
                       font, font_scale, (0, 0, 0), thickness)
        
        # Convert to PNG bytes
        _, buffer = cv2.imencode('.png', overlay)
        return buffer.tobytes()


    def warp_board_with_corners(self, bgr: np.ndarray, corners: list):
        """
        Warp board using provided corners.
        corners: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] as TL, TR, BR, BL
        """
        box = np.array(corners, dtype=np.float32)
        dst = np.array([[0,0],[WARP_SIZE-1,0],[WARP_SIZE-1,WARP_SIZE-1],[0,WARP_SIZE-1]], dtype=np.float32)
        M = cv2.getPerspectiveTransform(box, dst)
        warped = cv2.warpPerspective(bgr, M, (WARP_SIZE, WARP_SIZE))
        return warped, box, M


    def run(self, image: Image.Image, flip_ranks: bool = False, manual_corners: list = None):
        """
        Main inference pipeline.
        If manual_corners is provided, uses them instead of auto-detection.
        manual_corners: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] as TL, TR, BR, BL
        Returns (result_dict, overlay_png_bytes, debug_png_bytes).
        """
        # Convert PIL to BGR
        bgr = self._pil_to_bgr(image)
        
        # Find and warp board
        if manual_corners:
            warped, quad, transform = self.warp_board_with_corners(bgr, manual_corners)
        else:
            warped, quad, transform = self.find_and_warp_board(bgr)
        
        # Draw detected corners on original image for debugging
        debug_img = bgr.copy()
        for i, pt in enumerate(quad):
            cv2.circle(debug_img, (int(pt[0]), int(pt[1])), 15, (0, 0, 255), -1)
            cv2.putText(debug_img, str(i), (int(pt[0])+20, int(pt[1])+20),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        cv2.polylines(debug_img, [quad.astype(np.int32)], True, (0, 255, 0), 3)
        _, debug_buffer = cv2.imencode('.png', debug_img)
        debug_png = debug_buffer.tobytes()
        
        # Detect pieces
        detections = self.detect_pieces(warped)
        
        # Convert to FEN
        fen = self._detections_to_fen(detections, flip_ranks=flip_ranks)
        
        # Draw overlay
        overlay_png = self._draw_overlay(warped, detections)
        
        result = {
            "fen": fen,
            "num_pieces": len(detections),
            "detections": detections,
            "board_corners": quad.tolist()  # Add detected corners to result
        }
        
        return result, overlay_png, debug_png
