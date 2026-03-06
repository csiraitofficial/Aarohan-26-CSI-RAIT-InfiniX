import { Card } from "@/components/ui/card";
import { mockWeather } from "@/lib/mockData";
import { Cloud, Wind, Droplets, Thermometer } from "lucide-react";

const WeatherWidget = () => {
    const getAqiColor = (aqi: number) => {
        if (aqi <= 50) return "text-green-500";
        if (aqi <= 100) return "text-yellow-500";
        return "text-red-500";
    };

    return (
        <Card className="p-4 bg-gradient-card border-2 border-primary/20 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-full">
                    <Cloud className="h-8 w-8 text-primary" />
                </div>
                <div>
                    <div className="text-3xl font-bold">{mockWeather.temp}°C</div>
                    <div className="text-sm text-muted-foreground">{mockWeather.condition}</div>
                </div>
            </div>

            <div className="flex gap-6 text-sm">
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1 text-muted-foreground mb-1">
                        <Wind className="h-3 w-3" /> Wind
                    </div>
                    <span className="font-medium">{mockWeather.windSpeed} km/h</span>
                </div>
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1 text-muted-foreground mb-1">
                        <Droplets className="h-3 w-3" /> Humidity
                    </div>
                    <span className="font-medium">{mockWeather.humidity}%</span>
                </div>
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1 text-muted-foreground mb-1">
                        <Thermometer className="h-3 w-3" /> AQI
                    </div>
                    <span className={`font-bold ${getAqiColor(mockWeather.aqi)}`}>{mockWeather.aqi}</span>
                </div>
            </div>
        </Card>
    );
};

export default WeatherWidget;
