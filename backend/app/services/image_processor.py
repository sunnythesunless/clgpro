"""
Image Processor Service
Handles medical image validation, saving, and preprocessing for the AI model.
"""

import uuid
from pathlib import Path
from typing import Tuple

from PIL import Image
from fastapi import UploadFile, HTTPException, status

from app.config import settings


# Allowed image extensions
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".dcm", ".tiff", ".tif"}


async def validate_and_save_image(file: UploadFile) -> Tuple[str, str]:
    """
    Validate the uploaded image file and save it to disk.

    Returns:
        Tuple of (saved_filename, original_filename)

    Raises:
        HTTPException: If file is invalid or too large.
    """
    # Check file extension
    original_filename = file.filename or "unknown.png"
    ext = Path(original_filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read file content
    content = await file.read()

    # Check file size
    if len(content) > settings.max_file_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB}MB",
        )

    # Validate it's a real image
    try:
        img = Image.open(__import__("io").BytesIO(content))
        img.verify()  # Verify it's a valid image
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image file. Could not read the image.",
        )

    # Generate unique filename
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = settings.upload_path / unique_name

    # Save to disk
    with open(save_path, "wb") as f:
        f.write(content)

    return unique_name, original_filename


def preprocess_image_for_model(image_path: str) -> Image.Image:
    """
    Load and preprocess an image for the BLIP model.
    The BLIP processor handles resizing and normalization internally,
    so we just need to provide a clean RGB PIL Image.

    Args:
        image_path: Path to the saved image file.

    Returns:
        PIL Image in RGB mode.
    """
    full_path = settings.upload_path / image_path
    image = Image.open(full_path).convert("RGB")
    return image


def delete_image(filename: str) -> bool:
    """Delete an uploaded image file."""
    file_path = settings.upload_path / filename
    if file_path.exists():
        file_path.unlink()
        return True
    return False
