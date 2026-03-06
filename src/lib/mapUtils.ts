// Shared TomTom API Key and Map Utilities
export const TOMTOM_API_KEY = "riFTeh0wpjONJX0XItCu3qmHWF657Mia";

export const geocodeAddress = async (query: string): Promise<[number, number] | null> => {
    if (!query) return null;
    try {
        const response = await fetch(
            `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?key=${TOMTOM_API_KEY}&limit=1`
        );
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            const { lat, lon } = data.results[0].position;
            // Return as [lat, lon] to match our data structure convention
            return [lat, lon];
        }
    } catch (error) {
        console.error("Geocoding failed:", error);
    }
    return null;
};