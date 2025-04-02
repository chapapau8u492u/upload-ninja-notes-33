
/**
 * Utility for handling chunked file uploads to Supabase
 */

import { supabase } from "@/integrations/supabase/client";

// Maximum chunk size (45MB in bytes)
export const MAX_CHUNK_SIZE = 45 * 1024 * 1024;

// Maximum parallel uploads
export const MAX_PARALLEL_UPLOADS = 3;

interface ChunkMetadata {
  fileName: string;
  fileType: string;
  totalChunks: number;
  totalSize: number;
  uploadId: string;
}

/**
 * Splits a file into chunks of maximum size
 */
export function createFileChunks(file: File, maxChunkSize: number = MAX_CHUNK_SIZE): Blob[] {
  const chunks: Blob[] = [];
  let start = 0;
  
  while (start < file.size) {
    const end = Math.min(start + maxChunkSize, file.size);
    chunks.push(file.slice(start, end));
    start = end;
  }
  
  return chunks;
}

/**
 * Uploads a single chunk to Supabase storage
 */
export async function uploadChunk(
  chunk: Blob, 
  chunkIndex: number, 
  uploadId: string, 
  folderName: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<string> {
  const chunkFileName = `${uploadId}_chunk_${chunkIndex}`;
  const filePath = `${folderName}/${chunkFileName}`;
  
  // Using XHR for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const uploadUrl = `${getStorageUrl()}/object/notes/${filePath}`;
    
    xhr.open('POST', uploadUrl);
    
    // Add Supabase headers
    const apiKey = getSupabaseKey();
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    xhr.setRequestHeader('x-upsert', 'true');
    
    // Track progress events
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    };
    
    // Handle completion
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(filePath);
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
      }
    };
    
    // Handle errors
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.onabort = () => reject(new Error('Upload was aborted'));
    
    // Create FormData and send
    const formData = new FormData();
    formData.append('file', chunk);
    xhr.send(formData);
  });
}

/**
 * Store metadata about a chunked file upload
 */
export async function storeChunkMetadata(metadata: ChunkMetadata): Promise<void> {
  const metadataPath = `metadata/${metadata.uploadId}`;
  
  const { error } = await supabase.storage
    .from('notes')
    .upload(metadataPath, JSON.stringify(metadata));
    
  if (error) {
    throw new Error(`Failed to store metadata: ${error.message}`);
  }
}

/**
 * Create a server-side function that will handle the file download
 * This is a placeholder - in a real implementation, we'd need to create
 * a Supabase Edge Function to handle this.
 */
export async function createFileReassemblyRecord(
  fileName: string,
  fileUrl: string,
  uploadId: string,
  totalChunks: number
): Promise<void> {
  // For now, we simply create a record in the database that will be used
  // to identify this file as a chunked upload when downloading
  const { error } = await supabase
    .from("chunked_files")
    .insert({
      upload_id: uploadId,
      file_name: fileName,
      total_chunks: totalChunks,
      reassembled_url: fileUrl,
      is_processed: false
    });
    
  if (error) {
    throw new Error(`Failed to create reassembly record: ${error.message}`);
  }
}

// Helper functions
function getStorageUrl(): string {
  return 'https://qxmmsuakpqgcfhmngmjb.supabase.co/storage/v1';
}

function getSupabaseKey(): string {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bW1zdWFrcHFnY2ZobW5nbWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0ODEzNzcsImV4cCI6MjA1OTA1NzM3N30.BkT-HrDlR2HJ6iAhuaIFMD7H_jRFIu0Y9hpiSyU4EHY';
}
