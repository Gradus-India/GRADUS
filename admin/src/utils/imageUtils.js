/**
 * Converts an image file or blob to WebP format.
 * @param {File|Blob} file The source image.
 * @param {number} quality Compression quality from 0 to 1.
 * @returns {Promise<File>} A promise that resolves to the converted File object.
 */
export const convertToWebP = (file, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      return resolve(file); // Not an image or empty, return as is
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error("Canvas toBlob failed"));
            }
            // Create a new file with .webp extension
            const originalName = file.name || "image";
            const baseName =
              originalName.substring(0, originalName.lastIndexOf(".")) ||
              originalName;
            const newFile = new File([blob], `${baseName}.webp`, {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(newFile);
          },
          "image/webp",
          quality
        );
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error("File reader failed"));
    reader.readAsDataURL(file);
  });
};

export default { convertToWebP };
