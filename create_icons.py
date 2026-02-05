from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    """创建带有字母H的图标"""
    # 创建图像（蓝色背景）
    img = Image.new('RGB', (size, size), color='#4285f4')
    draw = ImageDraw.Draw(img)

    # 计算字体大小（大约是图标大小的70%）
    font_size = int(size * 0.7)

    try:
        # 尝试使用系统字体
        font = ImageFont.truetype('arial.ttf', font_size)
    except:
        try:
            # Windows备选字体
            font = ImageFont.truetype('Arial.ttf', font_size)
        except:
            try:
                font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', font_size)
            except:
                # 如果都失败了，使用默认字体
                font = ImageFont.load_default()

    # 计算文字位置（居中）
    text = "H"

    # 获取文字边界框
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    text_width = right - left
    text_height = bottom - top

    # 居中放置文字
    x = (size - text_width) / 2 - left
    y = (size - text_height) / 2 - top

    # 绘制白色文字
    draw.text((x, y), text, font=font, fill='white')

    # 保存图片
    img.save(output_path, 'PNG')
    print(f"[OK] Created {output_path} ({size}x{size})")

# 图标配置
icons_dir = os.path.join(os.path.dirname(__file__), 'icons')

# 创建三个不同尺寸的图标
create_icon(16, os.path.join(icons_dir, 'icon16.png'))
create_icon(48, os.path.join(icons_dir, 'icon48.png'))
create_icon(128, os.path.join(icons_dir, 'icon128.png'))

print("\nAll icons created successfully!")
