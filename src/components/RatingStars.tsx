
import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { rateNote } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface RatingStarsProps {
  noteId: string;
  averageRating: number | null;
  ratingsCount: number;
  interactive?: boolean;
  className?: string;
  onRatingChange?: () => void;
}

export const RatingStars = ({
  noteId,
  averageRating,
  ratingsCount,
  interactive = false,
  className,
  onRatingChange,
}: RatingStarsProps) => {
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const displayRating = hoveredRating ?? rating ?? averageRating ?? 0;

  const handleRating = async (newRating: number) => {
    if (!interactive) return;

    try {
      setIsLoading(true);
      // Generate a unique ID for anonymous users
      const anonymousId = localStorage.getItem('anonymous_user_id') || 
        `anon_${Math.random().toString(36).substring(2, 15)}`;
      
      // Store the ID in localStorage for future use
      if (!localStorage.getItem('anonymous_user_id')) {
        localStorage.setItem('anonymous_user_id', anonymousId);
      }
      
      await rateNote(noteId, anonymousId, newRating);
      setRating(newRating);
      
      if (onRatingChange) {
        onRatingChange();
      }
      
      toast({
        title: "Rating submitted",
        description: "Thank you for your feedback!",
      });
    } catch (error) {
      console.error("Error rating note:", error);
      toast({
        title: "Error submitting rating",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "h-5 w-5 cursor-default transition-colors",
              {
                "fill-yellow-400 text-yellow-400": star <= displayRating,
                "text-gray-300": star > displayRating,
                "cursor-pointer": interactive && !isLoading,
              }
            )}
            onClick={() => {
              if (interactive && !isLoading) handleRating(star);
            }}
            onMouseEnter={() => {
              if (interactive && !isLoading) setHoveredRating(star);
            }}
            onMouseLeave={() => {
              if (interactive && !isLoading) setHoveredRating(null);
            }}
          />
        ))}
      </div>
      <span className="mt-1 text-xs text-gray-500">
        {interactive 
          ? rating 
            ? "Your rating" 
            : "Rate this note"
          : ratingsCount > 0 
            ? `${averageRating?.toFixed(1)} (${ratingsCount} ${ratingsCount === 1 ? "rating" : "ratings"})` 
            : "No ratings yet"}
      </span>
    </div>
  );
};
