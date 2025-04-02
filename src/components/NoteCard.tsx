
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
      // Check if this is a chunked file download by looking for the 'chunked' path
      const isChunkedFile = fileUrl.includes('/notes/chunked/');
      
      if (isChunkedFile) {
        // For chunked files, we need to handle the download differently
        handleChunkedFileDownload();
      } else {
        // For regular files, proceed with the direct download
        const link = document.createElement("a");
        link.href = fileUrl;
        link.download = note.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      toast({
        title: "Error downloading file",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };
  
  // Handle downloading a file that was uploaded in chunks
  const handleChunkedFileDownload = () => {
    // Extract the upload ID from the file URL
    const urlParts = fileUrl.split('/');
    const uploadIdIndex = urlParts.indexOf('chunked') + 1;
    
    if (uploadIdIndex < urlParts.length) {
      const uploadId = urlParts[uploadIdIndex];
      
      // Show a toast indicating the download is starting
      toast({
        title: "Preparing download",
        description: "Please wait while we prepare your file...",
      });
      
      // In a production app, this would call a serverless function to handle
      // the reassembly of chunks. For now, we'll simulate a successful download
      // after a short delay.
      setTimeout(() => {
        // Create a link to download the file
        const link = document.createElement("a");
        link.href = fileUrl;
        link.download = note.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({
          title: "Download started",
          description: "Your file download has started",
        });
      }, 1500);
    } else {
      // Handle invalid URL format
      toast({
        title: "Error downloading file",
        description: "Invalid file URL format",
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
        <CardTitle className="text-lg font-bold line-clamp-1">{note.title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        {note.description && (
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
          Download
        </Button>
      </CardFooter>
    </Card>
  );
};
