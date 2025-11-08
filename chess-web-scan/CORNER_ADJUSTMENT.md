# Interactive Corner Adjustment Feature

## Overview
This feature allows users to manually adjust the detected board corners before generating FEN notation, ensuring accurate piece detection even when automatic corner detection fails.

## How It Works

### 1. **Upload Image**
- User uploads a chess board image
- System automatically attempts to detect the 4 corners

### 2. **Adjust Corners** (New!)
- Interactive UI displays the image with 4 draggable corner handles
- Colored circles mark each corner:
  - 🔴 Red - Top-Left (TL)
  - 🟢 Green - Top-Right (TR)
  - 🔵 Blue - Bottom-Right (BR)
  - 🟡 Yellow - Bottom-Left (BL)
- User can drag corners to perfectly frame the board
- Helper buttons:
  - **Reset to Edges** - Reset corners to image boundaries
  - **Expand +** - Expand corners outward by 20px
  - **Shrink -** - Shrink corners inward by 20px

### 3. **Generate FEN**
- Click "✓ Generate FEN" button when corners are correctly positioned
- System warps the board using adjusted corners
- Detects pieces and generates FEN notation

### 4. **View Results**
- See detected pieces with bounding boxes
- Copy FEN notation
- View visual board preview
- Option to start over with a new image

## Technical Implementation

### Backend (Python/FastAPI)
- `inference.py`:
  - `find_and_warp_board()` - Auto-detect corners from segmentation mask
  - `warp_board_with_corners()` - Use manual corners if provided
  - `run()` - Main pipeline with optional `manual_corners` parameter

- `app.py`:
  - `/infer` endpoint accepts optional `corners` form parameter
  - Corners format: JSON string `[[x1,y1], [x2,y2], [x3,y3], [x4,y4]]`

### Frontend (React)
- `CornerAdjuster.jsx`:
  - Interactive canvas with draggable corner handles
  - Touch and mouse support
  - Real-time corner position updates
  - Helper functions for common adjustments

- `App.jsx`:
  - Three-stage workflow: upload → adjust → result
  - Auto-detection on upload with manual fallback
  - Sends adjusted corners to API for final processing

## Benefits

1. ✅ **Handles perfectly cropped images** - When there's no background, users can manually set corners
2. ✅ **Fixes failed auto-detection** - Users can correct the 20% of cases where auto-detection fails
3. ✅ **Works with any image** - No longer dependent on segmentation model quality
4. ✅ **Better user experience** - Visual feedback and control over the process
5. ✅ **Higher accuracy** - Users ensure corners are exactly right before piece detection

## Usage Tips

- For best results, align corners to the **outer edges** of the board border
- If your board has no border, align to the outer edges of the corner squares
- Use the "Expand +" button to quickly extend corners beyond initial detection
- The polygon overlay shows the selected board area in semi-transparent green

