
export interface Note {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: string;
  uploader_id: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

export interface NoteWithDetails extends Note {
  profile: Profile;
}

export interface ChunkedFile {
  id: string;
  upload_id: string;
  file_name: string;
  total_chunks: number;
  reassembled_url: string;
  is_processed: boolean;
  created_at: string;
  updated_at: string;
}
