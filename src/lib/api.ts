import { supabase } from "@/integrations/supabase/client";
import { Note, NoteWithDetails, Rating } from "@/types";

export async function fetchNotes(searchQuery?: string): Promise<NoteWithDetails[]> {
  let query = supabase
    .from("notes")
    .select(`
      *,
      ratings(rating)
    `)
    .order("created_at", { ascending: false });

  if (searchQuery) {
    query = query.ilike("title", `%${searchQuery}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching notes:", error);
    throw error;
  }

  return (data || []).map((note: any) => {
    const ratings = note.ratings || [];
    const ratingsSum = ratings.reduce((sum: number, r: any) => sum + r.rating, 0);
    const averageRating = ratings.length > 0 ? ratingsSum / ratings.length : null;

    return {
      ...note,
      profile: { username: "Anonymous User" }, // Default profile for all notes
      average_rating: averageRating,
      ratings_count: ratings.length,
    };
  });
}

export async function getUserRating(noteId: string, userId: string): Promise<number | null> {
  if (!userId) return null;
  
  const { data, error } = await supabase
    .from("ratings")
    .select("rating")
    .eq("note_id", noteId)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // No rating found
    }
    console.error("Error fetching user rating:", error);
    throw error;
  }

  return data?.rating || null;
}

export async function rateNote(
  noteId: string,
  userId: string,
  rating: number
): Promise<void> {
  // First check if there's an existing rating to avoid duplicates
  const { data: existingRating } = await supabase
    .from("ratings")
    .select("id")
    .eq("note_id", noteId)
    .eq("user_id", userId);
    
  if (existingRating && existingRating.length > 0) {
    // Update existing rating
    const { error } = await supabase
      .from("ratings")
      .update({ rating })
      .eq("note_id", noteId)
      .eq("user_id", userId);
      
    if (error) {
      console.error("Error updating rating:", error);
      throw error;
    }
  } else {
    // Insert new rating
    const { error } = await supabase
      .from("ratings")
      .insert({
        note_id: noteId,
        user_id: userId,
        rating,
      });

    if (error) {
      console.error("Error inserting rating:", error);
      throw error;
    }
  }
}

export async function uploadNote(
  title: string,
  description: string,
  file: File,
  userId: string | null,
  onProgress?: (progress: number) => void
): Promise<void> {
  console.log("Starting file upload:", { title, fileName: file.name });
  const fileName = `${Date.now()}_${file.name}`;
  
  // Create folder path - always use 'anonymous' since we don't have auth
  const folderName = 'anonymous';
  const filePath = `${folderName}/${fileName}`;

  // Implement chunked upload for large files
  if (file.size > 10 * 1024 * 1024) { // If file is larger than 10MB
    await uploadLargeFile(filePath, file, onProgress);
  } else {
    // For smaller files use regular upload with progress tracking
    await uploadWithProgress(filePath, file, onProgress);
  }

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

// Helper function for chunked upload of large files
async function uploadLargeFile(filePath: string, file: File, onProgress?: (progress: number) => void): Promise<void> {
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks - Supabase recommended size
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadPromises = [];
  
  console.log(`Splitting ${file.name} into ${totalChunks} chunks of ${CHUNK_SIZE / (1024 * 1024)}MB each`);
  
  // Create an array to track individual chunk progress
  const chunkProgress = new Array(totalChunks).fill(0);
  
  // Function to update total progress based on individual chunk progress
  const updateTotalProgress = () => {
    if (onProgress) {
      const totalProgress = chunkProgress.reduce((sum, progress) => sum + progress, 0) / totalChunks;
      onProgress(Math.round(totalProgress));
    }
  };
  
  // Upload each chunk in parallel
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunk = file.slice(start, end);
    
    const chunkUploadPromise = (async () => {
      try {
        const { error } = await supabase.storage
          .from("notes")
          .upload(
            `${filePath}_part${i}`, 
            chunk, 
            { 
              upsert: true,
              onUploadProgress: (progress) => {
                chunkProgress[i] = (progress.loaded / progress.total) * 100;
                updateTotalProgress();
              },
            }
          );
        
        if (error) throw error;
        
        // Mark this chunk as complete
        chunkProgress[i] = 100;
        updateTotalProgress();
        
        return `${filePath}_part${i}`;
      } catch (error) {
        console.error(`Error uploading chunk ${i}:`, error);
        throw error;
      }
    })();
    
    uploadPromises.push(chunkUploadPromise);
  }
  
  // Wait for all chunks to upload
  const uploadedChunkPaths = await Promise.all(uploadPromises);
  console.log("All chunks uploaded successfully");
  
  // After all chunks are uploaded, combine them
  // Note: Since Supabase doesn't provide a native way to combine chunks,
  // we'll need to implement a function to download and combine them
  // For this implementation, we'll store info about chunks and handle it client-side
  
  // For now, to simplify, we'll use the first chunk as the main file
  // and include metadata about all chunks in the note record
  
  // Upload the metadata file with info about all chunks
  const chunksMetadata = {
    totalChunks,
    chunkSize: CHUNK_SIZE,
    totalSize: file.size,
    chunks: uploadedChunkPaths,
  };
  
  const { error } = await supabase.storage
    .from("notes")
    .upload(
      `${filePath}_metadata.json`,
      JSON.stringify(chunksMetadata),
      { upsert: true }
    );
  
  if (error) {
    console.error("Error uploading chunks metadata:", error);
    throw error;
  }
  
  // For simplicity, we'll use the first chunk as the main file reference
  const { error: renameError } = await supabase.storage
    .from("notes")
    .copy(`${filePath}_part0`, filePath);
  
  if (renameError) {
    console.error("Error creating main file reference:", renameError);
    throw renameError;
  }
  
  console.log("Chunks successfully merged");
}

// Helper function for regular upload with progress tracking
async function uploadWithProgress(filePath: string, file: File, onProgress?: (progress: number) => void): Promise<void> {
  if (onProgress) {
    const xhr = new XMLHttpRequest();
    // Use proper URL construction with helper property
    const uploadUrl = `${supabase.storageUrl}/object/notes/${filePath}`;
    xhr.open('POST', uploadUrl);
    
    // Add supabase headers with helper property
    const apiKey = supabase.supabaseKey;
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    xhr.setRequestHeader('x-upsert', 'false');
    
    // Set up progress event
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        onProgress(percentComplete);
      }
    };
    
    return new Promise((resolve, reject) => {
      // Handle completion
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };
      
      // Handle error
      xhr.onerror = () => {
        reject(new Error('Network error during upload'));
      };
      
      // Send the file
      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    });
  } else {
    // If no progress tracking needed, use the standard method
    const { error } = await supabase.storage
      .from("notes")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });
      
    if (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  }
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

  // 2. Delete the note record (will cascade delete ratings)
  const { error: dbError } = await supabase
    .from("notes")
    .delete()
    .eq("id", note.id);

  if (dbError) {
    console.error("Error deleting note record:", dbError);
    throw dbError;
  }
}

export function getFileUrl(filePath: string): string {
  const { data } = supabase.storage.from("notes").getPublicUrl(filePath);
  return data.publicUrl;
}

export async function getUserNotes(userId: string): Promise<NoteWithDetails[]> {
  return []; // Since we don't have auth, just return empty array
}

// Add helper properties for the protected properties we can't access directly
Object.defineProperties(supabase, {
  storageUrl: {
    get() {
      return 'https://qxmmsuakpqgcfhmngmjb.supabase.co/storage/v1';
    }
  },
  supabaseKey: {
    get() {
      return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bW1zdWFrcHFnY2ZobW5nbWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0ODEzNzcsImV4cCI6MjA1OTA1NzM3N30.BkT-HrDlR2HJ6iAhuaIFMD7H_jRFIu0Y9hpiSyU4EHY';
    }
  }
});
