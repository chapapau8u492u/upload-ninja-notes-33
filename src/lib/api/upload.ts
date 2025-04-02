
import { supabase } from "@/integrations/supabase/client";
import { 
  MAX_CHUNK_SIZE, 
  createFileChunks, 
  uploadChunk,
  storeChunkMetadata,
  MAX_PARALLEL_UPLOADS
} from "../chunkUploader";
import { formatFileSize, getFileUrl, getStorageUrl, getSupabaseKey } from "./helpers";

/**
 * Upload a note to the database
 */
export async function uploadNote(
  title: string,
  description: string,
  file: File,
  userId: string | null,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  console.log("Starting file upload:", { title, fileName: file.name });
  
  // Create folder path - always use 'anonymous' since we don't have auth
  const folderName = 'anonymous';
  
  // Determine if we need chunked upload
  const needsChunking = file.size > MAX_CHUNK_SIZE;
  
  // Start with initial progress
  if (onProgress) onProgress(0, file.size);
  
  let fileUrl: string;
  
  try {
    if (needsChunking) {
      // Use chunked upload for large files
      fileUrl = await uploadLargeFile(file, folderName, onProgress);
    } else {
      // Use direct upload for small files
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `${folderName}/${fileName}`;
      await uploadWithProgress(filePath, file, onProgress);
      fileUrl = getFileUrl(filePath);
    }

    console.log("File uploaded successfully:", { fileUrl });

    // For chunked files, we've already created the note record in storeChunkMetadata
    // So we only need to create a record for non-chunked files
    if (!needsChunking) {
      // Determine file type and size
      const fileType = file.type || 'application/octet-stream'; // Default type for unknown files
      const fileSize = formatFileSize(file.size);

      // Insert the note record
      const { error: insertError } = await supabase
        .from("notes")
        .insert({
          title,
          description,
          file_url: fileUrl,
          file_type: fileType,
          file_size: fileSize,
          file_name: file.name,
          uploader_id: null, // Always null since we don't use auth
        });

      if (insertError) {
        console.error("Error creating note record:", insertError);
        throw insertError;
      }
    }
    
    console.log("Note record created successfully");
  } catch (error) {
    console.error("Error in uploadNote:", error);
    // Make sure to show 100% at the end even if there was an error
    if (onProgress) onProgress(file.size, file.size);
    throw error;
  }
}

/**
 * Handles uploading of large files by splitting them into chunks
 */
async function uploadLargeFile(
  file: File, 
  folderName: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<string> {
  // Generate a unique ID for this upload
  const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  
  // Split the file into chunks
  const chunks = createFileChunks(file);
  console.log(`File split into ${chunks.length} chunks for upload`);
  
  // Track overall progress
  let totalUploaded = 0;
  const totalSize = file.size;
  let lastReportedProgress = 0;
  
  try {
    // Process chunks in batches to limit concurrency
    for (let i = 0; i < chunks.length; i += MAX_PARALLEL_UPLOADS) {
      const batch = chunks.slice(i, i + MAX_PARALLEL_UPLOADS);
      
      // Create promises for this batch
      const batchPromises = batch.map((chunk, index) => {
        const chunkIndex = i + index;
        
        // Upload chunk with a progress tracker that updates the total progress
        return uploadChunk(
          chunk, 
          chunkIndex, 
          uploadId, 
          folderName,
          // Pass a tracker that will contribute to total progress
          (loaded, total) => {
            // Calculate the progress contributed by this chunk to the total file
            const chunkProgress = (loaded / total) * (chunk.size / totalSize);
            
            // Add this chunk's progress to the total uploaded
            // This is an approximation as chunks may complete in different orders
            totalUploaded = chunks.slice(0, i).reduce((sum, c) => sum + c.size, 0) + 
                           loaded * (chunk.size / total);
            
            // Only report progress if it's changed by at least 1%
            const currentProgress = Math.floor((totalUploaded / totalSize) * 100);
            if (currentProgress > lastReportedProgress) {
              lastReportedProgress = currentProgress;
              if (onProgress) {
                onProgress(totalUploaded, totalSize);
              }
            }
          }
        );
      });
      
      // Wait for this batch to complete before starting the next one
      await Promise.all(batchPromises);
    }
    
    // Store metadata about this chunked upload
    const metadata = {
      fileName: file.name,
      fileType: file.type || 'application/octet-stream', // Default type for unknown files
      totalChunks: chunks.length,
      totalSize: file.size,
      uploadId
    };
    
    await storeChunkMetadata(metadata);
    
    // Return a URL that points to the file (even though it's chunked)
    // This URL will be used for display purposes and to trigger downloads
    const fileUrl = `${getStorageUrl()}/object/notes/chunked/${uploadId}/${encodeURIComponent(file.name)}`;
    
    // Ensure we show 100% at the end
    if (onProgress) onProgress(totalSize, totalSize);
    
    return fileUrl;
  } catch (error) {
    console.error("Error in uploadLargeFile:", error);
    throw error;
  }
}

// Helper function for direct upload with precise progress tracking
export async function uploadWithProgress(
  filePath: string, 
  file: File, 
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create and configure XHR
    const xhr = new XMLHttpRequest();
    const uploadUrl = `${getStorageUrl()}/object/notes/${filePath}`;
    
    xhr.open('POST', uploadUrl);
    
    // Add Supabase headers
    const apiKey = getSupabaseKey();
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    
    // Track progress events
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    };
    
    // Handle completion
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log("Upload completed successfully");
        if (onProgress) onProgress(file.size, file.size); // Ensure 100% at the end
        resolve();
      } else {
        console.error(`Upload failed with status ${xhr.status}:`, xhr.responseText);
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
      }
    };
    
    // Handle errors
    xhr.onerror = () => {
      console.error("Network error during upload");
      reject(new Error('Network error during upload'));
    };
    
    xhr.ontimeout = () => {
      console.error("Upload timed out");
      reject(new Error('Upload timed out'));
    };
    
    // Add more debug information
    xhr.onabort = () => {
      console.warn("Upload was aborted");
      reject(new Error('Upload was aborted'));
    };
    
    console.log("Starting XHR upload to:", uploadUrl);
    
    // Create FormData and send
    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}
