import os
import shutil
import random
from pathlib import Path

# Set random seed for reproducibility
random.seed(42)

# Paths
source_images = r"C:\Users\Najam jawed\Downloads\Compressed\peices txt\train\images"
source_labels = r"C:\Users\Najam jawed\Downloads\Compressed\peices txt\train\labels"

dest_train_images = "data/pieces/images/train"
dest_val_images = "data/pieces/images/val"
dest_train_labels = "data/pieces/labels/train"
dest_val_labels = "data/pieces/labels/val"

# Get all image files
image_files = [f for f in os.listdir(source_images) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
label_files = [f for f in os.listdir(source_labels) if f.endswith('.txt')]

print(f"Found {len(image_files)} images")
print(f"Found {len(label_files)} labels")

# Create pairs of images and labels by matching base names
pairs = []
for img_file in image_files:
    # Remove extension and find corresponding label
    img_base = os.path.splitext(img_file)[0]
    label_file = img_base + '.txt'

    if label_file in label_files:
        pairs.append((img_file, label_file))
    else:
        print(f"Warning: No label found for {img_file}")

print(f"\nMatched {len(pairs)} image-label pairs")

# Sort for consistency then shuffle for random split
pairs.sort()
random.shuffle(pairs)

# Calculate 85/15 split
total_pairs = len(pairs)
train_count = int(total_pairs * 0.85)
val_count = total_pairs - train_count

train_pairs = pairs[:train_count]
val_pairs = pairs[train_count:]

print(f"Split: {train_count} train, {val_count} val")

# Process and copy files
def process_pairs(pair_list, dest_images_folder, dest_labels_folder, start_index):
    processed = []
    for idx, (img_file, label_file) in enumerate(pair_list, start=start_index):
        # Get file extension
        img_ext = os.path.splitext(img_file)[1].lower()
        if img_ext == '.jpeg':
            img_ext = '.jpg'

        # Create new filenames
        new_img_name = f"piece_{idx:03d}{img_ext}"
        new_label_name = f"piece_{idx:03d}.txt"

        # Copy image
        src_img_path = os.path.join(source_images, img_file)
        dest_img_path = os.path.join(dest_images_folder, new_img_name)
        shutil.copy2(src_img_path, dest_img_path)

        # Copy label
        src_label_path = os.path.join(source_labels, label_file)
        dest_label_path = os.path.join(dest_labels_folder, new_label_name)
        shutil.copy2(src_label_path, dest_label_path)

        processed.append(new_img_name)

    return processed

# Process train pairs (starting from 001)
print(f"\nProcessing train pairs...")
train_processed = process_pairs(train_pairs, dest_train_images, dest_train_labels, 1)

# Process val pairs (continuing numbering)
print(f"Processing val pairs...")
val_processed = process_pairs(val_pairs, dest_val_images, dest_val_labels, train_count + 1)

# Summary
print("\n" + "="*60)
print("PIECES ORGANIZATION SUMMARY")
print("="*60)
print(f"Total image-label pairs processed: {len(pairs)}")
print(f"Train pairs: {len(train_processed)}")
print(f"Val pairs: {len(val_processed)}")

if train_processed:
    print(f"\nTrain folder:")
    print(f"  First: {train_processed[0]}")
    print(f"  Last: {train_processed[-1]}")
    print(f"  Location: {dest_train_images}")

if val_processed:
    print(f"\nVal folder:")
    print(f"  First: {val_processed[0]}")
    print(f"  Last: {val_processed[-1]}")
    print(f"  Location: {dest_val_images}")

print("\n" + "="*60)
print("PIECES DATASET STATUS")
print("="*60)
print(f"Train: {len(train_processed)} images with {len(train_processed)} labels")
print(f"Val: {len(val_processed)} images with {len(val_processed)} labels")
print(f"Total: {len(pairs)} images with {len(pairs)} labels")
print(f"Annotation: 100% (all images have labels)")
print("="*60)
