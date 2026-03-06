import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mockRecommendations } from "@/lib/mockData";
import { Lightbulb, ArrowRight, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SmartRecommendations = () => {
    const { toast } = useToast();

    const handleApply = (id: number) => {
        toast({
            title: "Recommendation Applied",
            description: "Traffic control systems have been updated.",
            variant: "default",
        });
    };

    return (
        <Card className="h-[400px] flex flex-col bg-gradient-card border-2 border-primary/20">
            <div className="p-4 border-b border-border bg-card/50">
                <h2 className="font-semibold flex items-center gap-2 text-lg">
                    <Lightbulb className="h-5 w-5 text-yellow-500" />
                    AI Insights
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Real-time optimization suggestions</p>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
                {mockRecommendations.map((rec) => (
                    <div key={rec.id} className="p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <Badge variant="outline" className={`${rec.impact === 'High' ? 'text-destructive border-destructive/50' : 'text-warning border-warning/50'
                                }`}>
                                {rec.impact} Impact
                            </Badge>
                            <span className="text-xs text-muted-foreground">{rec.location}</span>
                        </div>
                        <p className="text-sm font-medium mb-3">{rec.message}</p>
                        <Button
                            size="sm"
                            className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
                            onClick={() => handleApply(rec.id)}
                        >
                            <CheckCircle2 className="h-3 w-3 mr-2" />
                            Apply Recommendation
                        </Button>
                    </div>
                ))}
            </div>

            <div className="p-3 border-t border-border bg-card/50 text-center">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary">
                    View All Insights <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
            </div>
        </Card>
    );
};

export default SmartRecommendations;
