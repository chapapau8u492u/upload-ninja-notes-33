
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { NoteWithDetails } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface NoteCardProps {
  note: NoteWithDetails;
  onDelete?: () => void;
}

export const NoteCard = ({ note, onDelete }: NoteCardProps) => {
  const fileUrl = note.file_url;
  
  const handleDownload = () => {
    try {
      // Check if this is a chunked file by looking at the URL or title
      const isChunkedFile = 
        fileUrl.includes('/chunked/') || 
        (note.title?.startsWith('[chunked:') || false);
      
      if (isChunkedFile) {
        // For chunked files, show a toast and open the URL in a new tab
        toast({
          title: "Opening file",
          description: "The file will open in a new tab",
        });
        
        window.open(fileUrl, '_blank');
      } else {
        // For regular files, attempt to download
        window.open(fileUrl, '_blank');
      }
    } catch (error) {
      console.error("Error handling file:", error);
      toast({
        title: "Error accessing file",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };
  
  // Format uploaded date
  let uploadedDate;
  try {
    uploadedDate = formatDistanceToNow(new Date(note.created_at), { addSuffix: true });
  } catch (error) {
    uploadedDate = "Unknown date";
  }
  
  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-bold line-clamp-1">
          {/* Remove chunked prefix from display if present */}
          {note.title?.startsWith('[chunked:') 
            ? note.title.replace(/\[chunked:.*?\]\s*/, '') 
            : note.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        {note.description && !note.description.includes('Chunked file upload') && (
          <p className="text-sm text-gray-500 mb-2 line-clamp-2">{note.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            <span className="truncate max-w-[150px]">{note.file_name}</span>
          </div>
          <div>
            {note.file_size}
          </div>
          <div>
            {uploadedDate}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end pt-2">
        <Button 
          onClick={handleDownload} 
          variant="default" 
          size="sm"
          className="gap-1"
        >
          <Download className="h-4 w-4" />
          {fileUrl.includes('/chunked/') ? "Open" : "Download"}
        </Button>
      </CardFooter>
    </Card>
  );
};
