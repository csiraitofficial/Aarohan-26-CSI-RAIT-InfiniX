import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TOMTOM_API_KEY } from "@/lib/mapUtils";

interface Suggestion {
    label: string;
    lat: number;
    lng: number;
}

interface LocationAutocompleteProps {
    value?: string;
    onLocationSelect: (location: { address: string; coordinates: [number, number] }) => void;
    placeholder?: string;
    className?: string;
}

export function LocationAutocomplete({ value, onLocationSelect, placeholder = "Search city, street, or place...", className }: LocationAutocompleteProps) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value || "");
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (value) setInputValue(value);
    }, [value]);

    const handleSearch = useCallback(async (query: string) => {
        if (!query || query.length < 3) {
            setSuggestions([]);
            return;
        }

        setLoading(true);
        try {
            // Using TomTom Fuzzy Search for broad coverage (Cities, Streets, POIs)
            const response = await fetch(
                `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${TOMTOM_API_KEY}&limit=5`
            );
            const data = await response.json();

            if (data.results) {
                const results = data.results.map((item: any) => ({
                    label: item.address.freeformAddress,
                    lat: item.position.lat,
                    lng: item.position.lon
                }));
                // Filter duplicates by label
                const unique = results.filter((v: Suggestion, i: number, a: Suggestion[]) => a.findIndex(t => t.label === v.label) === i);
                setSuggestions(unique);
            }
        } catch (error) {
            console.error("Autocomplete fetch failed:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounce logic handled by useEffect on inputValue change if we were typing in Input directly, 
    // but CommandInput handles its own state. 
    // We need to hook into CommandInput's value change.
    // However, shadcn Command component encapsulates the input.
    // We'll trust the user to type and use the `onValueChange` of CommandInput if exposed, 
    // OR deeper integration. 
    // Simplification: We'll render our own Input inside the popover anchor or use `CommandInput`'s `onValueChange`.

    // NOTE: Shadcn's CommandInput often filters children automatically. 
    // Since we are doing server-side search, we should disable local filtering or manage it carefully.
    // For this implementation, we will perform the search when the value of CommandInput changes.

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between text-left font-normal truncate", !inputValue && "text-muted-foreground", className)}
                >
                    {inputValue || placeholder}
                    <MapPin className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Type address..."
                        onValueChange={(val) => {
                            handleSearch(val);
                        }}
                    />
                    <CommandList>
                        {loading && <div className="p-2 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Searching...</div>}
                        {!loading && suggestions.length === 0 && <CommandEmpty>No results found.</CommandEmpty>}
                        <CommandGroup heading="Search Results">
                            {suggestions.map((loc) => (
                                <CommandItem
                                    key={loc.label}
                                    value={loc.label}
                                    onSelect={() => {
                                        setInputValue(loc.label);
                                        onLocationSelect({
                                            address: loc.label,
                                            coordinates: [loc.lat, loc.lng]
                                        });
                                        setOpen(false);
                                    }}
                                >
                                    <MapPin className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                    {loc.label}
                                    <Check
                                        className={cn(
                                            "ml-auto h-4 w-4",
                                            inputValue === loc.label ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
