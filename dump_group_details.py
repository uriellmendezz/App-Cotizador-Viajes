import json

with open("estructura-plantilla-v2.json", "r", encoding="utf-8") as f:
    data = json.load(f)

slide = data["slides"][0]
elements = slide["pageElements"]

def print_element_details(e, prefix=""):
    oid = e["objectId"]
    size = e.get("size", {})
    transform = e.get("transform", {})
    w = size.get("width", {}).get("magnitude", 0)
    h = size.get("height", {}).get("magnitude", 0)
    tx = transform.get("translateX", 0)
    ty = transform.get("translateY", 0)
    sx = transform.get("scaleX", 1)
    sy = transform.get("scaleY", 1)
    
    e_type = "unknown"
    details = ""
    
    if "shape" in e:
        shape = e["shape"]
        e_type = f"shape ({shape.get('shapeType')})"
        text = ""
        if "text" in shape and "textElements" in shape["text"]:
            text = "".join([t.get("textRun", {}).get("content", "") for t in shape["text"]["textElements"] if "textRun" in t]).strip()
        details = f"Text: '{text.replace(chr(10), '\\n')}'"
        # outline/fill
        props = shape.get("shapeProperties", {})
        bg_fill = props.get("shapeBackgroundFill", {})
        if "solidFill" in bg_fill:
            details += f" | Fill: {bg_fill['solidFill'].get('color', {}).get('rgbColor', {})}"
        else:
            details += " | Fill: NONE"
            
    elif "image" in e:
        e_type = "image"
        details = f"URL: {e['image'].get('contentUrl', '')[:50]}"
        
    elif "line" in e:
        e_type = "line"
        
    elif "elementGroup" in e:
        e_type = "group"
        details = f"{len(e['elementGroup'].get('children', []))} children"

    print(f"{prefix}- {oid} ({e_type}): w={w}, h={h}, tx={tx}, ty={ty}, sx={sx}, sy={sy} | {details}")
    
    if "elementGroup" in e:
        for child in e["elementGroup"]["children"]:
            print_element_details(child, prefix + "  ")

# Groups to inspect
target_groups = ["g3f1aacc1efc_0_368", "g3f1aacc1efc_0_385", "g3f1aacc1efc_0_400", "g3f1aacc1efc_0_455"]

for e in elements:
    if e["objectId"] in target_groups:
        print_element_details(e)
