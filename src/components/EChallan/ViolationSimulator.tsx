import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { generateMockPlate } from "@/lib/anpr";
import { VIOLATION_TYPES, ViolationType } from "@/lib/violationTypes";
import { echallanDB } from "@/lib/echallanDB";
import { generateChallan } from "@/lib/challanGenerator";
import { v4 as uuidv4 } from 'uuid';
import { AlertCircle, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ViolationSimulator() {
    const [isGenerating, setIsGenerating] = useState(false);
    const { toast } = useToast();

    const simulateViolation = (type: ViolationType) => {
        setIsGenerating(true);

        // Generate mock violation
        const violation = {
            id: uuidv4(),
            type,
            vehicleNumber: generateMockPlate(),
            location: "Main Square - Camera 1",
            timestamp: new Date(),
            evidence: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            status: 'detected' as const
        };

        // Add to database
        echallanDB.addViolation(violation);

        // Generate challan
        const challan = generateChallan(violation);

        toast({
            title: "Violation Detected!",
            description: `${VIOLATION_TYPES[type].name} - ${violation.vehicleNumber}`,
        });

        console.log("Generated violation:", violation);
        console.log("Generated challan:", challan);

        setTimeout(() => setIsGenerating(false), 1000);
    };

    const violationButtons: ViolationType[] = ['RED_LIGHT', 'OVERSPEEDING', 'NO_HELMET'];

    return (
        <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Demo Violation Generator
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
                Simulate traffic violations for testing the e-Challan system
            </p>
            <div className="grid gap-2">
                {violationButtons.map((type) => (
                    <Button
                        key={type}
                        onClick={() => simulateViolation(type)}
                        disabled={isGenerating}
                        variant="outline"
                        className="justify-start"
                    >
                        <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
                        Generate {VIOLATION_TYPES[type].name}
                    </Button>
                ))}
            </div>
        </Card>
    );
}
