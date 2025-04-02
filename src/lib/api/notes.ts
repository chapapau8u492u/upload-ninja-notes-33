
import { supabase } from "@/integrations/supabase/client";
import { Note, NoteWithDetails } from "@/types";

/**
 * Fetch notes from the database
 */
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

/**
 * Delete a note from the database and storage
 */
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

/**
 * Get notes for a specific user
 */
export async function getUserNotes(userId: string): Promise<NoteWithDetails[]> {
  return []; // Since we don't have auth, just return empty array
}
