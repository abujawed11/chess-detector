"""
Fix Roboflow label filenames to match YOLO image names and organize them.
Removes the _jpg.rf.<hash> or _png.rf.<hash> suffix from label files.
"""

import os
import re
import shutil
import sys
from pathlib import Path

# Fix encoding for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def main():
    # Define paths
    base_dir = Path(__file__).parent
    labels_source = base_dir / "sample-images" / "robo text file"
    train_images_dir = base_dir / "data" / "board" / "images" / "train"
    val_images_dir = base_dir / "data" / "board" / "images" / "val"
    train_labels_dir = base_dir / "data" / "board" / "labels" / "train"
    val_labels_dir = base_dir / "data" / "board" / "labels" / "val"
    
    # Ensure label directories exist
    train_labels_dir.mkdir(parents=True, exist_ok=True)
    val_labels_dir.mkdir(parents=True, exist_ok=True)
    
    # Get all label files
    label_files = list(labels_source.glob("*.txt"))
    
    if not label_files:
        print(f"⚠️  No label files found in {labels_source}")
        return
    
    # Counters
    train_count = 0
    val_count = 0
    skipped = []
    
    # Pattern to match: _jpg.rf.<hash> or _png.rf.<hash>
    pattern = re.compile(r'_(jpg|png)\.rf\.[a-f0-9]+\.txt$', re.IGNORECASE)
    
    print(f"🔍 Processing {len(label_files)} label files...\n")
    
    for label_file in label_files:
        original_name = label_file.name
        
        # Remove the Roboflow suffix
        clean_name = pattern.sub('.txt', original_name)
        
        # Extract the base name and extension to find matching image
        # e.g., board_007.txt -> board_007
        base_name = clean_name.replace('.txt', '')
        
        # Check for matching images with different extensions
        image_found = False
        image_path = None
        destination_dir = None
        
        # Check in train directory
        for ext in ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']:
            potential_image = train_images_dir / f"{base_name}{ext}"
            if potential_image.exists():
                image_found = True
                image_path = potential_image
                destination_dir = train_labels_dir
                train_count += 1
                break
        
        # If not found in train, check in val directory
        if not image_found:
            for ext in ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']:
                potential_image = val_images_dir / f"{base_name}{ext}"
                if potential_image.exists():
                    image_found = True
                    image_path = potential_image
                    destination_dir = val_labels_dir
                    val_count += 1
                    break
        
        if image_found:
            # Move and rename the label file
            destination_path = destination_dir / clean_name
            shutil.copy2(label_file, destination_path)
            print(f"✅ {original_name}")
            print(f"   → {clean_name} → {destination_dir.parent.name}/{destination_dir.name}/")
        else:
            skipped.append(original_name)
            print(f"⚠️  No matching image found for: {original_name}")
    
    # Print summary
    print("\n" + "="*60)
    print("📊 SUMMARY")
    print("="*60)
    print(f"✅ Labels cleaned and moved successfully.")
    print(f"🧩 {train_count} train labels")
    print(f"🧩 {val_count} val labels")
    
    if skipped:
        print(f"\n⚠️  {len(skipped)} label(s) skipped (no matching image):")
        for name in skipped:
            print(f"   - {name}")
    
    print(f"\n✨ Total processed: {train_count + val_count}/{len(label_files)}")
    print("="*60)

if __name__ == "__main__":
    main()

