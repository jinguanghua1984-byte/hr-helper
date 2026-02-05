import cairosvg
from PIL import Image
import os

# 图标配置
icons = [
    {'name': 'icon16.svg', 'size': 16, 'output': 'icon16.png'},
    {'name': 'icon48.svg', 'size': 48, 'output': 'icon48.png'},
    {'name': 'icon128.svg', 'size': 128, 'output': 'icon128.png'}
]

icons_dir = os.path.join(os.path.dirname(__file__), 'icons')

for icon in icons:
    svg_path = os.path.join(icons_dir, icon['name'])
    png_path = os.path.join(icons_dir, icon['output'])

    # 读取SVG文件
    with open(svg_path, 'r', encoding='utf-8') as f:
        svg_data = f.read()

    # 转换为PNG
    cairosvg.svg2png(
        bytestring=svg_data.encode('utf-8'),
        write_to=png_path,
        output_width=icon['size'],
        output_height=icon['size']
    )

    print(f"✓ 已创建 {icon['output']} ({icon['size']}x{icon['size']})")

print("\n所有图标转换完成！")
