import os
import shutil
import re

# Paths
labels_source = "sample-images/robo text file"
train_images = "data/board/images/train"
val_images = "data/board/images/val"
train_labels = "data/board/labels/train"
val_labels = "data/board/labels/val"

# Get all txt files
txt_files = [f for f in os.listdir(labels_source) if f.endswith('.txt')]

print(f"Found {len(txt_files)} label files")

# Get list of images in train and val
train_image_files = os.listdir(train_images)
val_image_files = os.listdir(val_images)

# Extract board numbers from image filenames (without extension)
train_image_names = set([os.path.splitext(f)[0] for f in train_image_files])
val_image_names = set([os.path.splitext(f)[0] for f in val_image_files])

print(f"Train images: {len(train_image_names)}")
print(f"Val images: {len(val_image_names)}")

# Process each label file
train_copied = []
val_copied = []
not_matched = []

for txt_file in txt_files:
    # Extract board number from filename like: board_007_jpg.rf.xxx.txt
    match = re.match(r'board_(\d+)_', txt_file)

    if match:
        board_num = match.group(1)
        new_filename = f"board_{board_num}.txt"

        old_path = os.path.join(labels_source, txt_file)

        # Check if corresponding image is in train or val
        board_name = f"board_{board_num}"

        if board_name in train_image_names:
            # Copy to train labels
            new_path = os.path.join(train_labels, new_filename)
            shutil.copy2(old_path, new_path)
            train_copied.append(new_filename)
        elif board_name in val_image_names:
            # Copy to val labels
            new_path = os.path.join(val_labels, new_filename)
            shutil.copy2(old_path, new_path)
            val_copied.append(new_filename)
        else:
            not_matched.append(txt_file)
            print(f"Warning: No matching image found for {txt_file}")
    else:
        not_matched.append(txt_file)
        print(f"Warning: Could not parse filename: {txt_file}")

# Sort for display
train_copied.sort()
val_copied.sort()

# Summary
print("\n" + "="*60)
print("LABEL ORGANIZATION SUMMARY")
print("="*60)
print(f"Total label files processed: {len(txt_files)}")
print(f"Copied to train/labels: {len(train_copied)}")
print(f"Copied to val/labels: {len(val_copied)}")
print(f"Not matched: {len(not_matched)}")

if train_copied:
    print(f"\nTrain labels:")
    print(f"  First: {train_copied[0]}")
    print(f"  Last: {train_copied[-1]}")
    print(f"  Total: {len(train_copied)}")

if val_copied:
    print(f"\nVal labels:")
    print(f"  First: {val_copied[0]}")
    print(f"  Last: {val_copied[-1]}")
    print(f"  Total: {len(val_copied)}")

print("\n" + "="*60)
print("DATASET STATUS")
print("="*60)
print(f"Train: {len(train_image_names)} images, {len(train_copied)} labels")
print(f"Val: {len(val_image_names)} images, {len(val_copied)} labels")
print(f"Total: {len(train_image_names) + len(val_image_names)} images, {len(train_copied) + len(val_copied)} labels")

# Calculate annotation percentage
total_images = len(train_image_names) + len(val_image_names)
total_labels = len(train_copied) + len(val_copied)
annotation_pct = (total_labels / total_images * 100) if total_images > 0 else 0
print(f"Annotation progress: {annotation_pct:.1f}% ({total_labels}/{total_images})")
print("="*60)
