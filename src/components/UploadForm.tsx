
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { uploadNote } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { FileUp, FileText, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

const uploadFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  file: z
    .instanceof(FileList)
    .refine((files) => files.length === 1, "Please select a file")
    .transform((files) => files[0])
    .refine((file) => file.size <= MAX_FILE_SIZE, "File size must be less than 200MB"),
});

type UploadFormValues = z.infer<typeof uploadFormSchema>;

interface UploadFormProps {
  onSuccess?: () => void;
}

export const UploadForm = ({ onSuccess }: UploadFormProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState<string>('');
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState<string>('');
  
  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      title: "",
    },
  });
  
  const onSubmit = async (data: UploadFormValues) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);
      setUploadSpeed('Calculating...');
      setEstimatedTimeLeft('Calculating...');
      
      const fileToUpload: File = data.file;
      const startTime = Date.now();
      const fileSize = fileToUpload.size;
      let lastLoaded = 0;
      let lastTime = startTime;
      
      // Track progress in real-time with speed calculation
      const trackProgress = (progress: number) => {
        console.log(`Upload progress: ${progress}%`);
        setUploadProgress(progress);
        
        const currentTime = Date.now();
        const timeElapsed = (currentTime - startTime) / 1000; // in seconds
        
        // Only calculate speed after we have some progress
        if (progress > 0) {
          // Calculate loaded bytes based on percentage
          const loadedBytes = (fileSize * progress) / 100;
          
          // Calculate time difference since last update (in seconds)
          const timeSinceLastUpdate = (currentTime - lastTime) / 1000;
          
          if (timeSinceLastUpdate > 0) {
            // Calculate bytes uploaded since last update
            const bytesSinceLastUpdate = loadedBytes - lastLoaded;
            
            // Calculate current speed in bytes per second
            const currentSpeed = bytesSinceLastUpdate / timeSinceLastUpdate;
            
            // Update speed in user-friendly format
            if (currentSpeed > 1024 * 1024) {
              setUploadSpeed(`${(currentSpeed / (1024 * 1024)).toFixed(2)} MB/s`);
            } else if (currentSpeed > 1024) {
              setUploadSpeed(`${(currentSpeed / 1024).toFixed(2)} KB/s`);
            } else {
              setUploadSpeed(`${Math.round(currentSpeed)} B/s`);
            }
            
            // Calculate estimated time remaining
            const bytesRemaining = fileSize - loadedBytes;
            const timeRemaining = bytesRemaining / currentSpeed;
            
            if (timeRemaining > 60) {
              setEstimatedTimeLeft(`${Math.round(timeRemaining / 60)} minutes`);
            } else {
              setEstimatedTimeLeft(`${Math.round(timeRemaining)} seconds`);
            }
            
            // Update last values for next calculation
            lastLoaded = loadedBytes;
            lastTime = currentTime;
          }
        }
      };
      
      await uploadNote(
        data.title,
        "", // Empty description
        fileToUpload,
        null, // No user ID needed anymore
        trackProgress // Pass the progress tracker
      );
      
      toast({
        title: "Note uploaded",
        description: "Your note has been uploaded successfully",
      });
      
      form.reset();
      setSelectedFile(null);
      setUploadProgress(0);
      setUploadSpeed('');
      setEstimatedTimeLeft('');
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error("Error uploading note:", error);
      toast({
        title: "Error uploading note",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
      // Pass the files directly to form.setValue
      form.setValue("file", files, { shouldValidate: true });
    } else {
      setSelectedFile(null);
    }
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Enter note title" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="file"
          render={({ field: { onChange, value, ...rest } }) => (
            <FormItem>
              <FormLabel>File</FormLabel>
              <FormControl>
                <div className="flex flex-col space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      onChange={(e) => {
                        handleFileChange(e);
                      }}
                      {...rest}
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer flex items-center justify-center w-full gap-2 border-2 border-dashed border-gray-300 rounded-md py-3 px-4 hover:bg-gray-50 transition-colors"
                    >
                      <FileUp className="h-5 w-5 text-gray-500" />
                      <span className="text-gray-500">
                        {selectedFile ? "Change file" : "Select a file"}
                      </span>
                    </label>
                  </div>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {selectedFile && (
          <Card className="bg-gray-50 mt-4">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-blue-500" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {isUploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
            {uploadSpeed && (
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Speed: {uploadSpeed}</span>
                <span>Estimated time: {estimatedTimeLeft}</span>
              </div>
            )}
          </div>
        )}
        
        <Button 
          type="submit" 
          className="w-full" 
          disabled={isUploading}
        >
          {isUploading ? (
            <>
              <Upload className="mr-2 h-4 w-4 animate-pulse" />
              Uploading...
            </>
          ) : (
            <>
              <FileUp className="mr-2 h-4 w-4" />
              Upload Note
            </>
          )}
        </Button>
      </form>
    </Form>
  );
};
