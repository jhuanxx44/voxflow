/**
 * Materials Service - Handles API calls for materials library
 */

import type { Material, MaterialsResponse, MaterialOperationResponse } from '@/types/materials';

const API_BASE_URL = '';

/**
 * Fetches the list of available materials from the server
 * @returns Promise<Material[]> - Array of materials with computed URLs
 */
export async function getMaterials(): Promise<Material[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/materials`);
    if (!response.ok) {
      throw new Error(`Failed to fetch materials: ${response.statusText}`);
    }

    const data: MaterialsResponse = await response.json();

    // Add URL to each material
    return data.materials.map(mat => ({
      ...mat,
      url: `${API_BASE_URL}/materials/${encodeURIComponent(mat.name)}`
    }));
  } catch (error) {
    console.error('Error loading materials:', error);
    throw error;
  }
}

/**
 * Gets the download URL for a specific material
 * @param filename - Name of the material file
 * @returns Download URL
 */
export function getMaterialDownloadUrl(filename: string): string {
  return `${API_BASE_URL}/materials/${encodeURIComponent(filename)}`;
}

/**
 * Uploads a new material to the server
 * @param file - File to upload
 * @param password - Admin password
 * @returns Promise<MaterialOperationResponse> - Upload result
 */
export async function uploadMaterial(
  file: File,
  password: string
): Promise<MaterialOperationResponse> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', password);

    const response = await fetch(`${API_BASE_URL}/admin/upload`, {
      method: 'POST',
      body: formData
    });

    const data: MaterialOperationResponse = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    return data;
  } catch (error) {
    console.error('Error uploading material:', error);
    throw error;
  }
}

/**
 * Deletes a material from the server
 * @param filename - Name of the material to delete
 * @param password - Admin password
 * @returns Promise<MaterialOperationResponse> - Delete result
 */
export async function deleteMaterial(
  filename: string,
  password: string
): Promise<MaterialOperationResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/delete/${encodeURIComponent(filename)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password })
      }
    );

    const data: MaterialOperationResponse = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Delete failed');
    }

    return data;
  } catch (error) {
    console.error('Error deleting material:', error);
    throw error;
  }
}

/**
 * Formats file size in bytes to human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
