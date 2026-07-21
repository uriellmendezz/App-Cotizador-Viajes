import os
import re

folder = 'assets/iconos-carga'
icons = []
for fname in sorted(os.listdir(folder)):
    if fname.endswith('.svg'):
        fpath = os.path.join(folder, fname)
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            content = re.sub(r'fill="[^"]*"', 'fill="currentColor"', content)
            if 'fill=' not in content:
                content = content.replace('<svg ', '<svg fill="currentColor" ')
            if 'class=' not in content:
                content = content.replace('<svg ', '<svg class="w-16 h-16" ')
            else:
                content = re.sub(r'class="[^"]*"', 'class="w-16 h-16"', content)
            content = ' '.join(content.split())
            icons.append((fname, content))

print(f"Loaded {len(icons)} icons.")

os.makedirs('scratch', exist_ok=True)
with open('scratch/loading_icons.js', 'w', encoding='utf-8') as f:
    f.write("// Loaded 35 travel icons from assets/iconos-carga/\n")
    f.write("const loadingTravelIcons = [\n")
    for name, svg in icons:
        f.write(f"    // {name}\n")
        f.write(f"    `{svg}`,\n")
    f.write("];\n")

print("Generated scratch/loading_icons.js successfully.")
