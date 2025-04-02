import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Scissors } from "lucide-react";
import { NoteWithDetails } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface NoteCardProps {
  note: NoteWithDetails;
  onDelete?: () => void;
}

export const NoteCard = ({ note, onDelete }: NoteCardProps) => {
  const fileUrl = note.file_url;
  const isCompressed = note.title?.includes('[compressed]');
  
  const handleDownload = () => {
    try {
      // Open the file in a new tab, letting the browser handle the display or download
      window.open(fileUrl, '_blank');
      
      toast({
        title: "File opened",
        description: "The file has been opened in a new tab",
      });
    } catch (error) {
      console.error("Error accessing file:", error);
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
  
  // Clean up the title by removing prefixes
  let displayTitle = note.title || '';
  
  // Remove chunked prefix
  if (displayTitle.startsWith('[chunked:')) {
    displayTitle = displayTitle.replace(/\[chunked:.*?\]\s*/, '');
  }
  
  // Remove compressed prefix but keep track of it
  if (displayTitle.startsWith('[compressed]')) {
    displayTitle = displayTitle.replace(/\[compressed\]\s*/, '');
  }
  
  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-bold line-clamp-1 flex items-center gap-2">
          {displayTitle}
          {isCompressed && (
            <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-normal bg-amber-50 px-1.5 py-0.5 rounded-full">
              <Scissors className="h-3 w-3" />
              Compressed
            </span>
          )}
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
          Open
        </Button>
      </CardFooter>
    </Card>
  );
};
