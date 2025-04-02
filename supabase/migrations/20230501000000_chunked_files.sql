
-- Create a table to track chunked file uploads
CREATE TABLE IF NOT EXISTS chunked_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  total_chunks INTEGER NOT NULL,
  reassembled_url TEXT NOT NULL,
  is_processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create an index on the upload_id for faster lookups
CREATE INDEX IF NOT EXISTS chunked_files_upload_id_idx ON chunked_files(upload_id);
