import json

with open("estructura-plantilla-v2.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for slide in data.get("slides", []):
    for e in slide.get("pageElements", []):
        if "image" in e:
            print("Image ID:", e.get("objectId"))
            print("  URL:", e["image"].get("contentUrl")[:60])
        elif "elementGroup" in e:
            for child in e["elementGroup"].get("children", []):
                if "image" in child:
                    print("Group Image ID:", child.get("objectId"))
                    print("  URL:", child["image"].get("contentUrl")[:60])
