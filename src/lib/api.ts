
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

  // 1. Upload the file to storage with progress tracking
  const { error: uploadError, data } = await supabase.storage
    .from("notes")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      // Progress tracking needs to use the progress event
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          if (onProgress) {
            onProgress(percent);
          }
        }
      },
    });

  if (uploadError) {
    console.error("Error uploading file:", uploadError);
    throw uploadError;
  }

  // Get the public URL of the uploaded file
  const fileUrl = getFileUrl(filePath);
  
  // Determine file type and size
  const fileType = file.type || 'unknown';
  const fileSize = formatFileSize(file.size);

  console.log("File uploaded successfully:", { fileUrl, fileType, fileSize });

  // 2. Insert the note record
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
