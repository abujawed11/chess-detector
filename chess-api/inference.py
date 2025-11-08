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
        areas = [m.xy.shape[0] for m in res.masks] # rough proxy
        idx = int(np.argmax(areas))
        mask = res.masks.data[idx].cpu().numpy().astype(np.uint8) # (H,W) 0/1


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
        pass  # Placeholder - file appears incomplete
