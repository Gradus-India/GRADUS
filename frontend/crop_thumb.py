
from PIL import Image

image_path = "d:/GRADUS Project/GRADUS/frontend/public/assets/images/thumbs/why-gradus-thumbnail.png"
output_path = "d:/GRADUS Project/GRADUS/frontend/public/assets/images/thumbs/why-gradus-thumbnail-cropped.png"

try:
    img = Image.open(image_path)
    width, height = img.size
    
    # Crop the left side (approx 45% seems to be text, video is on right)
    # Based on the screenshot, it looks like a 2-column layout. 
    # Let's crop from 45% of width to 100% of width.
    # Actually, let's try 50% first as it looks like a standard col-6 layout.
    
    left = width * 0.45 
    top = 0
    right = width
    bottom = height
    
    cropped_img = img.crop((left, top, right, bottom))
    
    # Save the cropped image
    cropped_img.save(output_path)
    print(f"Successfully cropped image to {output_path}")

except Exception as e:
    print(f"Error cropping image: {e}")
