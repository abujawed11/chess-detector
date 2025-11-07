# create_chess_detector_structure.ps1
# Creates the full folder and file layout for the Chess Detector project

$root = "D:\chess-detector"

# Folder list
$folders = @(
    "$root\data\board\images",
    "$root\data\board\labels",
    "$root\data\pieces\images",
    "$root\data\pieces\labels",
    "$root\data\test",
    "$root\data\synthetic",
    "$root\models\board",
    "$root\models\pieces",
    "$root\exports",
    "$root\notebooks",
    "$root\docs"
)

# Create all directories
foreach ($folder in $folders) {
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
}

# Create placeholder files
New-Item -ItemType File -Path "$root\docs\labeling_guidelines.md" -Force | Out-Null
New-Item -ItemType File -Path "$root\docs\classes.txt" -Force | Out-Null
New-Item -ItemType File -Path "$root\.gitignore" -Force | Out-Null
New-Item -ItemType File -Path "$root\README.md" -Force | Out-Null

# Optional: write a note into README.md
@"
# Chess Detector Project

Folder structure initialized.
Use data\board for board detection training and data\pieces for piece detection.

"@ | Set-Content "$root\README.md"

Write-Host "✅ Folder structure created at $root"
