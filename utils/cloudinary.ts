export const uploadMediaToCloudinary = async (file: File): Promise<{ url: string; type: 'image' | 'video' }> => {
  const cloudName = "dgymbeaxk";
  const uploadPreset = "group_pfp_upload";
  
  const isVideo = file.type.startsWith('video/');
  const resourceType = isVideo ? 'video' : 'image';
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "Failed to upload media to Cloudinary");
  }

  const data = await response.json();
  return { 
    url: data.secure_url, 
    type: resourceType as 'image' | 'video' 
  };
};

/** @deprecated Use uploadMediaToCloudinary instead */
export const uploadImageToCloudinary = async (file: File): Promise<string> => {
  const res = await uploadMediaToCloudinary(file);
  return res.url;
};
