import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Video, VideoOff, AlertTriangle } from "lucide-react";

interface StreamPreviewProps {
  name: string;
  status: "active" | "offline" | "error";
  location: string;
  onClick?: () => void;
}

export const StreamPreview = ({ name, status, location, onClick }: StreamPreviewProps) => {
  const statusConfig = {
    active: { icon: Video, color: "bg-success", text: "Live" },
    offline: { icon: VideoOff, color: "bg-muted", text: "Offline" },
    error: { icon: AlertTriangle, color: "bg-destructive", text: "Error" },
  };

  const { icon: StatusIcon, color, text } = statusConfig[status];

  return (
    <Card 
      className="relative overflow-hidden cursor-pointer group hover:border-primary/50 transition-all"
      onClick={onClick}
    >
      <div className="aspect-video bg-gradient-to-br from-card to-muted flex items-center justify-center">
        <StatusIcon className="h-12 w-12 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div className="absolute top-2 right-2">
        <Badge className={`${color} text-foreground text-xs`}>{text}</Badge>
      </div>
      <div className="p-3 space-y-1">
        <h4 className="font-semibold text-sm text-foreground">{name}</h4>
        <p className="text-xs text-muted-foreground">{location}</p>
      </div>
    </Card>
  );
};
