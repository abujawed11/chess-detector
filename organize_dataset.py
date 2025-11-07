import os
import shutil
import random
from pathlib import Path

# Set random seed for reproducibility
random.seed(42)

# Paths
source_folder = "sample-images"
train_images = "data/board/images/train"
val_images = "data/board/images/val"

# Get all image files
image_extensions = ('.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG')
image_files = [f for f in os.listdir(source_folder)
               if f.lower().endswith(image_extensions)]

# Sort to ensure consistent ordering
image_files.sort()

print(f"Found {len(image_files)} images in {source_folder}")

# Randomly shuffle the files
random.shuffle(image_files)

# Calculate split
total_images = len(image_files)
train_count = int(total_images * 0.85)
val_count = total_images - train_count

print(f"\nSplit: {train_count} train, {val_count} val")

# Split the files
train_files = image_files[:train_count]
val_files = image_files[train_count:]

# Process and move files
def process_files(file_list, destination, start_index):
    moved_files = []
    for idx, old_filename in enumerate(file_list, start=start_index):
        # Get file extension
        ext = os.path.splitext(old_filename)[1].lower()
        if ext == '.jpeg':
            ext = '.jpg'

        # Create new filename
        new_filename = f"board_{idx:03d}{ext}"

        # Copy file to destination with new name
        old_path = os.path.join(source_folder, old_filename)
        new_path = os.path.join(destination, new_filename)

        shutil.copy2(old_path, new_path)
        moved_files.append(new_filename)

    return moved_files

# Process train files (starting from 001)
print(f"\nProcessing train images...")
train_moved = process_files(train_files, train_images, 1)

# Process val files (continuing numbering)
print(f"Processing val images...")
val_moved = process_files(val_files, val_images, train_count + 1)

# Summary
print("\n" + "="*60)
print("SUMMARY")
print("="*60)
print(f"Total images processed: {total_images}")
print(f"Train images: {len(train_moved)}")
print(f"Val images: {len(val_moved)}")
print(f"\nTrain folder:")
print(f"  First: {train_moved[0] if train_moved else 'N/A'}")
print(f"  Last: {train_moved[-1] if train_moved else 'N/A'}")
print(f"\nVal folder:")
print(f"  First: {val_moved[0] if val_moved else 'N/A'}")
print(f"  Last: {val_moved[-1] if val_moved else 'N/A'}")
print("="*60)
print("\nImages have been COPIED (originals preserved in sample-images)")
