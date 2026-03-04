import { useQuery } from "@tanstack/react-query";
import { MapPin, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Location } from "@shared/schema";

interface LocationSwitcherProps {
  tenantId: number;
  selectedLocationId: number | null;
  onLocationChange: (locationId: number | null) => void;
}

export function LocationSwitcher({ tenantId, selectedLocationId, onLocationChange }: LocationSwitcherProps) {
  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
  });

  return (
    <div className="flex items-center gap-2">
      <MapPin className="h-4 w-4 text-muted-foreground" />
      <Select
        value={selectedLocationId?.toString() ?? "all"}
        onValueChange={(val) => onLocationChange(val === "all" ? null : Number(val))}
      >
        <SelectTrigger className="w-[220px]" data-testid="select-location-switcher">
          <SelectValue placeholder={isLoading ? "Loading..." : "All Locations"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" data-testid="option-all-locations">All Locations</SelectItem>
          {locations.map((loc) => (
            <SelectItem key={loc.id} value={loc.id.toString()} data-testid={`option-location-${loc.id}`}>
              {loc.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
