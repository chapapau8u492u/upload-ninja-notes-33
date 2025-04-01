
import { supabase } from "@/integrations/supabase/client";
import { Note, NoteWithDetails } from "@/types";

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
  console.log("Starting file upload:", { title, fileName: file.name });
  const fileName = `${Date.now()}_${file.name}`;
  
  // Create folder path - always use 'anonymous' since we don't have auth
  const folderName = 'anonymous';
  const filePath = `${folderName}/${fileName}`;
  
  // Start with initial progress
  if (onProgress) onProgress(0, file.size);
  
  // For all files, use the direct XHR upload to track progress accurately
  await uploadWithProgress(filePath, file, onProgress);
  
  // Get the public URL of the uploaded file
  const fileUrl = getFileUrl(filePath);
  
  // Determine file type and size
  const fileType = file.type || 'unknown';
  const fileSize = formatFileSize(file.size);

  console.log("File uploaded successfully:", { fileUrl, fileType, fileSize });

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
    // Attempt to clean up the file if the record insertion fails
    await supabase.storage.from("notes").remove([filePath]);
    console.error("Error creating note record:", insertError);
    throw insertError;
  }
  
  console.log("Note record created successfully");
}

// Helper function for direct upload with precise progress tracking
async function uploadWithProgress(
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
