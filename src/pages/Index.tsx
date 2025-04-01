
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoteCard } from "@/components/NoteCard";
import { fetchNotes } from "@/lib/api";
import { NoteWithDetails } from "@/types";
import { FileText, Search, Upload, Star } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const Index = () => {
  const navigate = useNavigate();
  
  const [notes, setNotes] = useState<NoteWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"rating" | "date">("rating");
  
  const loadNotes = async () => {
    try {
      setIsLoading(true);
      const fetchedNotes = await fetchNotes(searchQuery || undefined);
      
      // Sort notes based on the selected sorting option
      const sortedNotes = [...fetchedNotes];
      if (sortBy === "date") {
        sortedNotes.sort((a, b) => {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      }
      // for rating, we're already sorting in the API function
      
      setNotes(sortedNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    loadNotes();
  }, [sortBy]);
  
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    loadNotes();
  };
  
  const clearSearch = async () => {
    setSearchQuery("");
    try {
      setIsLoading(true);
      const fetchedNotes = await fetchNotes();
      setNotes(fetchedNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleNoteUpdate = () => {
    loadNotes();
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container py-4 flex justify-between items-center max-w-6xl">
          <Link to="/" className="flex items-center gap-2 text-2xl font-bold">
            <FileText className="h-6 w-6" />
            Notes Sharing
          </Link>
          
          <Button 
            onClick={() => navigate("/upload")}
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Upload Note
          </Button>
        </div>
      </header>
      
      <main className="container py-8 max-w-6xl">
        <section className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Find and Share Notes</h1>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search notes by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit">Search</Button>
            {searchQuery && (
              <Button type="button" variant="outline" onClick={clearSearch}>
                Clear
              </Button>
            )}
          </form>
        </section>
        
        <Separator className="my-6" />
        
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">
              {searchQuery ? "Search Results" : "All Notes"}
            </h2>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <span>Sort by: {sortBy === "rating" ? "Rating" : "Date"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSortBy("rating")}>
                  <Star className="mr-2 h-4 w-4" /> Highest Rating
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("date")}>
                  <FileText className="mr-2 h-4 w-4" /> Latest Upload
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {isLoading ? (
            <div className="text-center py-12 space-y-4">
              <Progress value={75} className="max-w-md mx-auto" />
              <p>Loading notes...</p>
            </div>
          ) : notes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {notes.map((note) => (
                <NoteCard 
                  key={note.id} 
                  note={note} 
                  onDelete={handleNoteUpdate}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <h3 className="text-xl font-medium mb-2">No notes found</h3>
              <p className="text-gray-500 mb-6">
                {searchQuery 
                  ? "No notes match your search criteria. Try different keywords."
                  : "There are no notes available yet."}
              </p>
              <Button onClick={() => navigate("/upload")}>Upload Note</Button>
            </div>
          )}
        </section>
      </main>
      
      <footer className="bg-gray-100 border-t py-8">
        <div className="container max-w-6xl">
          <div className="text-center text-gray-500 text-sm">
            <p>© {new Date().getFullYear()} Notes Sharing App. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
