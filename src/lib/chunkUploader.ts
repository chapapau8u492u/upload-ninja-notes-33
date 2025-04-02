
/**
 * Utility for handling chunked file uploads to Supabase
 */

import { supabase } from "@/integrations/supabase/client";
import 'compression-streams-polyfill';

// Maximum chunk size (5MB in bytes) - smaller than Supabase's limit
export const MAX_CHUNK_SIZE = 5 * 1024 * 1024;

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
 * Compresses a file using GZIP compression
 * @returns A compressed Blob with the same file type
 */
export async function compressFile(file: File): Promise<Blob> {
  try {
    console.log(`Starting compression for file: ${file.name} (${formatFileSize(file.size)})`);
    
    // Create a ReadableStream from the file
    const fileStream = file.stream();
    
    // Compress the stream using GZIP
    const compressedStream = fileStream.pipeThrough(new CompressionStream('gzip'));
    
    // Convert the compressed stream back to a blob
    const compressedBlob = await new Response(compressedStream).blob();
    
    console.log(`Compression complete: Original size: ${formatFileSize(file.size)}, Compressed size: ${formatFileSize(compressedBlob.size)}`);
    
    return compressedBlob;
  } catch (error) {
    console.error("Error during file compression:", error);
    throw new Error(`Compression failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Splits a file into chunks of maximum size
 */
export function createFileChunks(file: File | Blob, maxChunkSize: number = MAX_CHUNK_SIZE): Blob[] {
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
    xhr.setRequestHeader('Content-Type', chunk.type || 'application/octet-stream');
    
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
        console.error(`Chunk upload failed with status ${xhr.status}:`, xhr.responseText);
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
      }
    };
    
    // Handle errors
    xhr.onerror = () => {
      console.error("Network error during chunk upload");
      reject(new Error('Network error during upload'));
    };
    xhr.ontimeout = () => {
      console.error("Chunk upload timed out");
      reject(new Error('Upload timed out'));
    };
    xhr.onabort = () => {
      console.error("Chunk upload was aborted");
      reject(new Error('Upload was aborted'));
    };
    
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
  try {
    // Instead of creating a record in chunked_files table (which doesn't exist in the types),
    // we'll create a notes record with special formatting
    await createChunkedFileRecord(
      metadata.fileName,
      `${getStorageUrl()}/object/notes/chunked/${metadata.uploadId}/${encodeURIComponent(metadata.fileName)}`,
      metadata.uploadId,
      metadata.totalChunks,
      metadata.fileType,
      formatFileSize(metadata.totalSize)
    );
  } catch (error) {
    console.error("Error in storeChunkMetadata:", error);
    throw error;
  }
}

/**
 * Create a database record to track the chunked file using the notes table
 */
export async function createChunkedFileRecord(
  fileName: string,
  fileUrl: string,
  uploadId: string,
  totalChunks: number,
  fileType: string,
  fileSize: string
): Promise<void> {
  try {
    // Using a special title format to identify chunked files
    const title = `[chunked:${uploadId}] ${fileName}`;
    const description = `Chunked file upload (${totalChunks} chunks). Upload ID: ${uploadId}`;
    
    const { error } = await supabase
      .from("notes")
      .insert({
        title: title,
        description: description,
        file_name: fileName,
        file_url: fileUrl,
        file_type: fileType || 'application/octet-stream', // Default type for unknown files
        file_size: fileSize
      });
      
    if (error) {
      console.error("Error creating chunked file record:", error);
      throw new Error(`Failed to create chunked file record: ${error.message}`);
    }
  } catch (error) {
    console.error("Error in createChunkedFileRecord:", error);
    throw error;
  }
}

// Helper function to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper functions
function getStorageUrl(): string {
  return 'https://qxmmsuakpqgcfhmngmjb.supabase.co/storage/v1';
}

function getSupabaseKey(): string {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bW1zdWFrcHFnY2ZobW5nbWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0ODEzNzcsImV4cCI6MjA1OTA1NzM3N30.BkT-HrDlR2HJ6iAhuaIFMD7H_jRFIu0Y9hpiSyU4EHY';
}
