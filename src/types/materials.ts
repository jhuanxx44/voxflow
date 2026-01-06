/**
 * Materials-related type definitions for FunASR Audio Editor
 */

/**
 * Represents a material file in the materials library
 */
export interface Material {
  /** Material filename */
  name: string;
  /** File size in bytes */
  size: number;
  /** Upload timestamp */
  uploaded_at: string;
  /** Download URL (computed on frontend) */
  url: string;
}

/**
 * Response from /materials API
 */
export interface MaterialsResponse {
  materials: Omit<Material, 'url'>[];
}

/**
 * Response from upload/delete operations
 */
export interface MaterialOperationResponse {
  success?: boolean;
  message?: string;
  error?: string;
}
