import json
import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
json_path = os.path.join(BASE_DIR, "estructura-v3.json")

print(f"Loading {json_path}...")
with open(json_path, "r", encoding="utf-8") as f:
    data = json.load(f)

slide = data["slides"][0]
print(f"Slide objectId: {slide['objectId']}")

print("\n--- IMAGE ELEMENTS ---")
for el in slide.get("pageElements", []):
    if "image" in el:
        print(f"ID: {el['objectId']}")
        print(f"  Comment: {el.get('_comentario', 'N/A')}")
        print(f"  Url: {el['image'].get('contentUrl', '')[:60]}...")
        transform = el.get("transform", {})
        print(f"  Transform: {transform}")

print("\n--- ALL ELEMENTS WITH 'vuelo' OR 'hotel' in comment ---")
for el in slide.get("pageElements", []):
    com = el.get("_comentario", "").lower()
    if "vuelo" in com or "hotel" in com or "estrella" in com or "galeria" in com or "galería" in com:
        print(f"ID: {el['objectId']}")
        print(f"  Comment: {el.get('_comentario', 'N/A')}")
        if "shape" in el:
            print(f"  Type: SHAPE ({el['shape'].get('shapeType')})")
        elif "image" in el:
            print(f"  Type: IMAGE")
        else:
            print(f"  Type: OTHER")
