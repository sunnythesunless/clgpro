"""
Generate high-fidelity sample medical images for testing and demonstration.
Creates:
1. sample_images/chest_xray_normal.png
2. sample_images/chest_xray_infiltrate.png
3. sample_images/brain_ct_scan.png
"""

import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "sample_images"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def generate_chest_xray(has_infiltrate: bool = False) -> str:
    img = Image.new("L", (600, 600), color=20)
    draw = ImageDraw.Draw(img)

    # Thoracic cage boundary
    draw.rounded_rectangle((60, 40, 540, 560), radius=50, outline=60, width=4)

    # Spine column
    draw.rectangle((285, 30, 315, 570), fill=75)
    for y in range(60, 540, 28):
        draw.line((280, y, 320, y), fill=110, width=3)

    # Posterior & Anterior Ribs
    for y in range(90, 500, 45):
        # Left ribs
        draw.arc((70, y, 300, y + 70), start=180, end=340, fill=65, width=5)
        # Right ribs
        draw.arc((300, y, 530, y + 70), start=200, end=360, fill=65, width=5)

    # Lung fields (radiolucent = darker)
    draw.ellipse((85, 90, 270, 480), fill=10, outline=50, width=2)
    draw.ellipse((330, 90, 515, 480), fill=10, outline=50, width=2)

    # Cardiac silhouette (dense = radiopaque brighter)
    draw.ellipse((220, 270, 380, 470), fill=125, outline=160, width=2)

    # Aortic knob & mediastinum
    draw.ellipse((270, 160, 330, 230), fill=110)

    # Diaphragm domes
    draw.arc((80, 430, 280, 540), start=180, end=360, fill=130, width=4)
    draw.arc((320, 440, 520, 540), start=180, end=360, fill=120, width=4)

    # If infiltrate requested, simulate alveolar opacity in right lower lobe
    if has_infiltrate:
        # Patchy consolidation
        draw.ellipse((350, 330, 490, 450), fill=95)
        draw.ellipse((380, 360, 460, 430), fill=140)

    # Apply slight gaussian blur to simulate radiographic scatter
    img = img.filter(ImageFilter.GaussianBlur(radius=1.8))

    filename = "chest_xray_infiltrate.png" if has_infiltrate else "chest_xray_normal.png"
    target = OUTPUT_DIR / filename
    img.save(target, format="PNG")
    print(f"Generated: {target}")
    return str(target)


def generate_brain_ct() -> str:
    img = Image.new("L", (600, 600), color=10)
    draw = ImageDraw.Draw(img)

    # Calvarium (skull bone - very bright)
    draw.ellipse((90, 60, 510, 540), fill=35, outline=230, width=12)

    # Brain parenchyma (intermediate gray)
    draw.ellipse((105, 75, 495, 525), fill=65)

    # Interhemispheric fissure (falx cerebri)
    draw.line((300, 80, 300, 520), fill=85, width=2)

    # Lateral ventricles (CSF - dark)
    # Anterior horns
    draw.polygon([(280, 210), (260, 270), (288, 260)], fill=20)
    draw.polygon([(320, 210), (340, 270), (312, 260)], fill=20)

    # Third ventricle
    draw.ellipse((295, 275, 305, 325), fill=20)

    # Choroid plexus calcifications (bright white specks)
    draw.ellipse((250, 310, 262, 322), fill=220)
    draw.ellipse((338, 310, 350, 322), fill=220)

    img = img.filter(ImageFilter.GaussianBlur(radius=1.2))
    target = OUTPUT_DIR / "brain_ct_scan.png"
    img.save(target, format="PNG")
    print(f"Generated: {target}")
    return str(target)


if __name__ == "__main__":
    generate_chest_xray(has_infiltrate=False)
    generate_chest_xray(has_infiltrate=True)
    generate_brain_ct()
    print("All sample medical test images created successfully!")
