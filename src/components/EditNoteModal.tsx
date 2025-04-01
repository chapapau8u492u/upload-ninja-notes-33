
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pencil } from 'lucide-react';
import { updateNote } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { NoteWithDetails } from '@/types';

interface EditNoteModalProps {
  note: NoteWithDetails;
  onUpdateSuccess?: () => void;
}

export const EditNoteModal = ({ note, onUpdateSuccess }: EditNoteModalProps) => {
  const [title, setTitle] = useState(note.title);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsLoading(true);
      await updateNote(note.id, { title });
      
      toast({
        title: "Note Updated",
        description: "Your note has been successfully updated.",
      });
      
      onUpdateSuccess?.();
    } catch (error) {
      toast({
        title: "Error Updating Note",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Note</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter new note title"
          />
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "Updating..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
