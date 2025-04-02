
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
import { uploadNote, MAX_FILE_SIZE, COMPRESSION_THRESHOLD } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { FileUp, FileText, Upload, AlertCircle, Info, Scissors } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatFileSize } from "@/lib/chunkUploader";

// Define the upload form schema with validation
const uploadFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  file: z
    .instanceof(FileList)
    .refine((files) => files.length === 1, "Please select a file")
    .transform((files) => files[0]),
});

type UploadFormValues = z.infer<typeof uploadFormSchema>;

interface UploadFormProps {
  onSuccess?: () => void;
}

export const UploadForm = ({ onSuccess }: UploadFormProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState<string>('Calculating...');
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState<string>('Calculating...');
  const [isChunkedUpload, setIsChunkedUpload] = useState(false);
  const [willCompress, setWillCompress] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  
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
      setUploadedBytes(0);
      setUploadSpeed('Calculating...');
      setEstimatedTimeLeft('Calculating...');
      
      // Check if we need to use chunked upload or compression
      const fileSize = data.file.size;
      const needsChunking = fileSize > MAX_FILE_SIZE;
      const needsCompression = fileSize > COMPRESSION_THRESHOLD && fileSize <= MAX_FILE_SIZE * 1.5;
      
      setIsChunkedUpload(needsChunking);
      
      // Show compressing state if needed
      if (needsCompression) {
        setIsCompressing(true);
        toast({
          title: "Compressing file",
          description: "Large file detected. Compressing before upload...",
          duration: 5000,
        });
      }
      
      let fileToUpload: File = data.file;
      
      if (fileToUpload.name.endsWith('.txt') && (!fileToUpload.type || fileToUpload.type === '')) {
        fileToUpload = new File(
          [fileToUpload], 
          fileToUpload.name, 
          { type: 'text/plain' }
        );
      }
      
      const startTime = Date.now();
      const fileSize = fileToUpload.size;
      let lastLoaded = 0;
      let lastTime = startTime;
      let speedHistory: number[] = [];
      
      const trackProgress = (loaded: number, total: number) => {
        // Once we start receiving progress updates, we're past the compression phase
        if (isCompressing) setIsCompressing(false);
        
        const progress = Math.round((loaded / total) * 100);
        console.log(`Upload progress: ${progress}%, ${formatFileSize(loaded)}/${formatFileSize(total)}`);
        
        setUploadProgress(progress);
        setUploadedBytes(loaded);
        
        const currentTime = Date.now();
        const timeElapsed = (currentTime - lastTime) / 1000; // in seconds
        
        if (timeElapsed > 0) {
          const bytesDiff = loaded - lastLoaded;
          const currentSpeed = bytesDiff / timeElapsed;
          
          if (currentSpeed > 0) {
            speedHistory.push(currentSpeed);
            if (speedHistory.length > 5) {
              speedHistory.shift();
            }
          }
          
          const avgSpeed = speedHistory.length > 0 
            ? speedHistory.reduce((sum, speed) => sum + speed, 0) / speedHistory.length 
            : currentSpeed;
          
          setUploadSpeed(formatSpeed(avgSpeed));
          
          if (avgSpeed > 0) {
            const bytesRemaining = total - loaded;
            const timeRemaining = bytesRemaining / avgSpeed;
            setEstimatedTimeLeft(formatTime(timeRemaining));
          }
          
          lastLoaded = loaded;
          lastTime = currentTime;
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
      setUploadedBytes(0);
      setUploadSpeed('');
      setEstimatedTimeLeft('');
      setWillCompress(false);
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
      setIsCompressing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
      
      const fileSize = files[0].size;
      setIsChunkedUpload(fileSize > MAX_FILE_SIZE);
      
      // Check if file will be compressed
      const needsCompression = fileSize > COMPRESSION_THRESHOLD && fileSize <= MAX_FILE_SIZE * 1.5;
      setWillCompress(needsCompression);
      
      form.setValue("file", files as unknown as any, { shouldValidate: true });
    } else {
      setSelectedFile(null);
      setWillCompress(false);
    }
  };
  
  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond > 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
    } else if (bytesPerSecond > 1024) {
      return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
    } else {
      return `${Math.round(bytesPerSecond)} B/s`;
    }
  };
  
  const formatTime = (seconds: number): string => {
    if (seconds < 1) {
      return 'Less than a second';
    } else if (seconds < 60) {
      return `${Math.round(seconds)} seconds`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')} minutes`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}:${minutes.toString().padStart(2, '0')} hours`;
    }
  };
  
  const isExtremelyLarge = selectedFile && selectedFile.size > MAX_FILE_SIZE * 1.5;
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Size information */}
        <Alert variant="default" className="mb-4">
          <Info className="h-4 w-4" />
          <AlertTitle>Large File Upload Support</AlertTitle>
          <AlertDescription>
            <p className="mb-2">Files over 50MB will be automatically uploaded in chunks.</p>
            <p>Files between 48MB and 75MB will be compressed before uploading to improve upload speed.</p>
          </AlertDescription>
        </Alert>

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
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{formatFileSize(selectedFile.size)}</span>
                    
                    {willCompress && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Scissors className="h-3 w-3" />
                        Will be compressed
                      </span>
                    )}
                    
                    {selectedFile.size > MAX_FILE_SIZE && (
                      <span className="text-amber-600">
                        (Will be uploaded in chunks)
                      </span>
                    )}
                    
                    {isExtremelyLarge && (
                      <span className="text-red-600 font-medium">
                        Warning: File may be too large to upload even with chunking
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {isUploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>
                {isCompressing ? 'Compressing file...' : 
                  isChunkedUpload ? 'Chunked upload in progress...' : 'Uploading...'}
              </span>
              <span>
                {uploadProgress}% • {selectedFile && uploadedBytes > 0 ? 
                  `${formatFileSize(uploadedBytes)}/${formatFileSize(selectedFile.size)}` : 
                  'Processing...'}
              </span>
            </div>
            <Progress value={isCompressing ? 5 : uploadProgress} className="h-2" />
            {!isCompressing && uploadSpeed && (
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
          disabled={isUploading || isExtremelyLarge}
        >
          {isUploading ? (
            <>
              {isCompressing ? (
                <>
                  <Scissors className="mr-2 h-4 w-4 animate-pulse" />
                  Compressing...
                </>
              ) : isChunkedUpload ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-pulse" />
                  Uploading in chunks...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-pulse" />
                  Uploading...
                </>
              )}
            </>
          ) : (
            <>
              <FileUp className="mr-2 h-4 w-4" />
              Upload Note
            </>
          )}
        </Button>
        
        {selectedFile && selectedFile.size > MAX_FILE_SIZE && !isUploading && (
          <p className="text-sm text-amber-600 mt-2 text-center">
            This is a large file ({formatFileSize(selectedFile.size)}). It will be uploaded in smaller chunks.
          </p>
        )}
        
        {selectedFile && willCompress && !isUploading && (
          <p className="text-sm text-amber-600 mt-2 text-center">
            This file will be compressed before uploading to improve upload speed.
          </p>
        )}
        
        {isExtremelyLarge && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>File too large</AlertTitle>
            <AlertDescription>
              This file is extremely large (over 75MB) and may not upload successfully even with our compression. 
              Please consider using an external compression tool before uploading.
            </AlertDescription>
          </Alert>
        )}
      </form>
    </Form>
  );
};
