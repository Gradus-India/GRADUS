import apiClient from "./apiClient";
import { convertToWebP } from "../utils/imageUtils";

export const uploadImage = async ({ file, token }) => {
  if (!file) throw new Error("file is required");

  let processedFile = file;
  if (file.type.startsWith("image/")) {
    processedFile = await convertToWebP(file);
  }

  const form = new FormData();
  form.append("file", processedFile);
  const data = await apiClient("/admin/uploads/image", {
    method: "POST",
    data: form,
    token,
  });
  const item = data?.item || data;
  return {
    url: item?.url || "",
    publicId: item?.publicId || "",
    width: item?.width,
    height: item?.height,
    format: item?.format,
  };
};

export const uploadToSupabase = async ({ file, token }) => {
  if (!file) throw new Error("file is required");

  let processedFile = file;
  if (file.type.startsWith("image/")) {
    processedFile = await convertToWebP(file);
  }

  const form = new FormData();
  form.append("file", processedFile);
  const data = await apiClient("/admin/uploads/landing-page-image", {
    method: "POST",
    data: form,
    token,
  });
  const item = data?.item || data;
  return {
    url: item?.url || "",
    path: item?.path || "",
  };
};

export default { uploadImage, uploadToSupabase };
