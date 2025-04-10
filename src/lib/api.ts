import { supabase } from "@/integrations/supabase/client";
import { Note, NoteWithDetails } from "@/types";
import { 
  createFileChunks, 
  uploadChunk, 
  storeChunkMetadata, 
  MAX_CHUNK_SIZE,
  compressFile,
  formatFileSize
} from "@/lib/chunkUploader";

// We're setting a 50MB file size limit for direct uploads
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Compression threshold - files larger than this will be compressed
export const COMPRESSION_THRESHOLD = 48 * 1024 * 1024; // 48 MB

export async function fetchNotes(searchQuery?: string): Promise<NoteWithDetails[]> {
  let query = supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (searchQuery) {
    query = query.ilike("title", `%${searchQuery}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching notes:", error);
    throw error;
  }

  // Map notes to include default profile information
  const notes = (data || []).map((note: any) => {
    return {
      ...note,
      profile: { username: "Anonymous User" }, // Default profile for all notes
    };
  });

  return notes;
}

export async function uploadNote(
  title: string,
  description: string,
  file: File,
  userId: string | null,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  console.log("Starting file upload:", { title, fileName: file.name, fileSize: file.size });
  
  let fileToUpload: File | Blob = file;
  let isCompressed = false;
  
  // For files over the compression threshold but under the max size, compress them
  if (file.size > COMPRESSION_THRESHOLD && file.size <= MAX_FILE_SIZE * 1.5) {
    try {
      if (onProgress) onProgress(0, file.size);
      console.log(`File size (${formatFileSize(file.size)}) exceeds compression threshold, compressing...`);
      
      fileToUpload = await compressFile(file);
      isCompressed = true;
      
      console.log(`Compression complete: Original: ${formatFileSize(file.size)}, Compressed: ${formatFileSize(fileToUpload.size)}`);
      
      // Update title to indicate compression
      title = isCompressed ? `[compressed] ${title}` : title;
      
      // If compression didn't reduce file size enough, use chunking
      if (fileToUpload.size > MAX_FILE_SIZE) {
        console.log("File still too large after compression, using chunked upload");
        return uploadWithChunking(title, description, fileToUpload, userId, onProgress);
      }
    } catch (error) {
      console.error("Compression failed, falling back to normal upload logic:", error);
      // Continue with normal upload logic if compression fails
    }
  }
  
  // For files under 50MB, use direct upload
  if (fileToUpload.size <= MAX_FILE_SIZE) {
    return uploadDirectly(title, description, fileToUpload, userId, onProgress);
  }
  
  // For larger files, use chunked upload
  return uploadWithChunking(title, description, fileToUpload, userId, onProgress);
}

// Original direct upload method for files under 50MB
async function uploadDirectly(
  title: string,
  description: string,
  file: File | Blob,
  userId: string | null,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  console.log("Starting direct upload:", { fileName: file instanceof File ? file.name : 'Blob' });
  
  // Start with initial progress
  if (onProgress) onProgress(0, file.size);
  
  try {
    // Create folder path - always use 'anonymous' since we don't have auth
    const folderName = 'anonymous';
    
    // Generate a unique file name to prevent conflicts
    const fileName = file instanceof File 
      ? `${Date.now()}_${file.name}`
      : `${Date.now()}_compressedFile.gz`;
      
    const filePath = `${folderName}/${fileName}`;
    
    // Use direct upload with progress tracking
    await uploadWithProgress(filePath, file, onProgress);
    
    // Get the public URL for the uploaded file
    const fileUrl = getFileUrl(filePath);
    
    console.log("File uploaded successfully:", { fileUrl });

    // Determine file type and size
    const fileType = file instanceof File ? (file.type || 'application/octet-stream') : 'application/gzip';
    const fileSize = formatFileSize(file.size);
    const displayName = file instanceof File ? file.name : fileName;

    // Insert the note record
    const { error: insertError } = await supabase
      .from("notes")
      .insert({
        title,
        description,
        file_url: fileUrl,
        file_type: fileType,
        file_size: fileSize,
        file_name: displayName,
        uploader_id: null, // Always null since we don't use auth
      });

    if (insertError) {
      console.error("Error creating note record:", insertError);
      throw insertError;
    }
    
    console.log("Note record created successfully");
  } catch (error) {
    console.error("Error in uploadNote:", error);
    // Make sure to show 100% at the end even if there was an error
    if (onProgress) onProgress(file.size, file.size);
    throw error;
  }
}

// New chunked upload for large files
async function uploadWithChunking(
  title: string,
  description: string,
  file: File | Blob,
  userId: string | null,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  const fileName = file instanceof File ? file.name : `compressedFile_${Date.now()}.gz`;
  console.log("Starting chunked upload:", { fileName, fileSize: formatFileSize(file.size) });
  
  try {
    // Generate a unique upload ID for this file
    const uploadId = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const folderName = 'chunked'; // Store chunks in a specific folder
    
    // Split file into chunks
    const chunks = createFileChunks(file);
    const totalChunks = chunks.length;
    
    console.log(`File split into ${totalChunks} chunks`);
    
    let totalUploaded = 0;
    const totalSize = file.size;
    
    // Upload each chunk with progress tracking
    for (let i = 0; i < totalChunks; i++) {
      const chunk = chunks[i];
      const chunkProgress = (loaded: number) => {
        if (onProgress) {
          // Calculate overall progress
          const overallLoaded = totalUploaded + loaded;
          onProgress(overallLoaded, totalSize);
        }
      };
      
      // Upload this chunk
      await uploadChunk(chunk, i, uploadId, folderName, chunkProgress);
      
      // Update the total uploaded size
      totalUploaded += chunk.size;
      console.log(`Chunk ${i+1}/${totalChunks} uploaded, total progress: ${Math.round((totalUploaded / totalSize) * 100)}%`);
    }
    
    // After all chunks are uploaded, store metadata
    await storeChunkMetadata({
      fileName: fileName,
      fileType: file instanceof File ? (file.type || 'application/octet-stream') : 'application/gzip',
      totalChunks,
      totalSize: file.size,
      uploadId
    });
    
    console.log("All chunks uploaded successfully, metadata stored");
    
    // Ensure progress is set to 100% at the end
    if (onProgress) onProgress(totalSize, totalSize);
  } catch (error) {
    console.error("Error in chunked upload:", error);
    // Make sure to show 100% at the end even if there was an error
    if (onProgress) onProgress(file.size, file.size);
    throw error;
  }
}

// Helper function for direct upload with precise progress tracking
async function uploadWithProgress(
  filePath: string, 
  file: File | Blob, 
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

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function deleteNote(note: Note): Promise<void> {
  // Extract filename from the file_url
  const urlParts = note.file_url.split('/');
  const filePath = urlParts[urlParts.length - 2] + '/' + urlParts[urlParts.length - 1];
  
  // 1. Delete the file from storage
  const { error: storageError } = await supabase.storage
    .from("notes")
    .remove([filePath]);

  if (storageError) {
    console.error("Error deleting file:", storageError);
    throw storageError;
  }

  // 2. Delete the note record
  const { error: dbError } = await supabase
    .from("notes")
    .delete()
    .eq("id", note.id);

  if (dbError) {
    console.error("Error deleting note record:", dbError);
    throw dbError;
  }
}

// Define getFileUrl function only once
export function getFileUrl(filePath: string): string {
  const { data } = supabase.storage.from("notes").getPublicUrl(filePath);
  return data.publicUrl;
}

export async function getUserNotes(userId: string): Promise<NoteWithDetails[]> {
  return []; // Since we don't have auth, just return empty array
}

// Helper functions for upload
function getStorageUrl(): string {
  return 'https://qxmmsuakpqgcfhmngmjb.supabase.co/storage/v1';
}

function getSupabaseKey(): string {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bW1zdWFrcHFnY2ZobW5nbWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0ODEzNzcsImV4cCI6MjA1OTA1NzM3N30.BkT-HrDlR2HJ6iAhuaIFMD7H_jRFIu0Y9hpiSyU4EHY';
}
