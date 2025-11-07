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

# Get all image files from sample-images
image_extensions = ('.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG')
all_source_images = [f for f in os.listdir(source_folder)
                     if f.lower().endswith(image_extensions)]

# Get already processed images (those starting with board_)
existing_train = [f for f in os.listdir(train_images) if f.startswith('board_')]
existing_val = [f for f in os.listdir(val_images) if f.startswith('board_')]
all_existing = existing_train + existing_val

print(f"Total images in sample-images: {len(all_source_images)}")
print(f"Already processed: {len(all_existing)} (Train: {len(existing_train)}, Val: {len(existing_val)})")

# Determine the starting index for new images
if all_existing:
    # Extract numbers from board_XXX.ext format
    existing_numbers = []
    for fname in all_existing:
        try:
            num = int(fname.split('_')[1].split('.')[0])
            existing_numbers.append(num)
        except:
            pass
    next_index = max(existing_numbers) + 1 if existing_numbers else 1
else:
    next_index = 1

print(f"Starting index for new images: {next_index}")

# Filter out images that might already be processed (rough check)
# We'll just process all images since they're new additions
new_images = all_source_images
print(f"New images to process: {len(new_images)}")

# Sort for consistency
new_images.sort()

# Randomly shuffle
random.shuffle(new_images)

# Calculate split (85/15)
total_new = len(new_images)
train_count = int(total_new * 0.85)
val_count = total_new - train_count

print(f"\nNew split: {train_count} train, {val_count} val")

# Split the files
train_files = new_images[:train_count]
val_files = new_images[train_count:]

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

        # Only copy if it doesn't already exist
        if not os.path.exists(new_path):
            shutil.copy2(old_path, new_path)
            moved_files.append(new_filename)
        else:
            print(f"Skipped {new_filename} (already exists)")

    return moved_files

# Process train files
print(f"\nProcessing new train images...")
train_moved = process_files(train_files, train_images, next_index)

# Process val files (continuing numbering)
print(f"Processing new val images...")
val_moved = process_files(val_files, val_images, next_index + len(train_files))

# Get updated counts
updated_train = [f for f in os.listdir(train_images) if f.startswith('board_')]
updated_val = [f for f in os.listdir(val_images) if f.startswith('board_')]

# Summary
print("\n" + "="*60)
print("SUMMARY")
print("="*60)
print(f"New images processed: {len(train_moved) + len(val_moved)}")
print(f"New train images: {len(train_moved)}")
print(f"New val images: {len(val_moved)}")
print(f"\nTotal dataset now:")
print(f"  Train: {len(updated_train)} images")
print(f"  Val: {len(updated_val)} images")
print(f"  Total: {len(updated_train) + len(updated_val)} images")

if train_moved:
    print(f"\nNew train images:")
    print(f"  First: {train_moved[0]}")
    print(f"  Last: {train_moved[-1]}")

if val_moved:
    print(f"\nNew val images:")
    print(f"  First: {val_moved[0]}")
    print(f"  Last: {val_moved[-1]}")

print("="*60)
