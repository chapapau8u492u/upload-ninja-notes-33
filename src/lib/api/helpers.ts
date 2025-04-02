
import { supabase } from "@/integrations/supabase/client";

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get the full URL for a file path
 */
export function getFileUrl(filePath: string): string {
  const { data } = supabase.storage.from("notes").getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Get the Supabase storage URL
 */
export function getStorageUrl(): string {
  return 'https://qxmmsuakpqgcfhmngmjb.supabase.co/storage/v1';
}

/**
 * Get the Supabase API key
 */
export function getSupabaseKey(): string {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bW1zdWFrcHFnY2ZobW5nbWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0ODEzNzcsImV4cCI6MjA1OTA1NzM3N30.BkT-HrDlR2HJ6iAhuaIFMD7H_jRFIu0Y9hpiSyU4EHY';
}
