
import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RatingStars } from "./RatingStars";
import { downloadNote, deleteNote } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Edit, Download, Trash2 } from "lucide-react";
import { NoteWithDetails } from "@/types";
import { EditNoteModal } from "./EditNoteModal";

interface NoteCardProps {
  note: NoteWithDetails;
  onDelete?: () => void;
}

export const NoteCard = ({ note, onDelete }: NoteCardProps) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDownload = async () => {
    try {
      await downloadNote(note.file_url, note.file_name);
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Unable to download the note.",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this note?")) {
      try {
        setIsDeleting(true);
        await deleteNote(note.id);
        
        toast({
          title: "Note Deleted",
          description: "The note has been successfully deleted.",
        });
        
        onDelete?.();
      } catch (error) {
        toast({
          title: "Delete Failed",
          description: "Unable to delete the note.",
          variant: "destructive"
        });
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>{note.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            {note.file_name} | {note.file_size}
          </p>
        </div>
        <div className="flex gap-2 mt-2">
          <EditNoteModal 
            note={note} 
            onUpdateSuccess={onDelete} 
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDownload} 
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={handleDelete} 
            disabled={isDeleting}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </CardContent>
      <CardFooter>
        <RatingStars 
          noteId={note.id} 
          initialRating={note.user_rating || 0} 
          averageRating={note.average_rating || 0} 
          ratingsCount={note.ratings_count || 0}
        />
      </CardFooter>
    </Card>
  );
};
