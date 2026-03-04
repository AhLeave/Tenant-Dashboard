import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3, ChevronDown, Download, FileX, Loader2, RefreshCw,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import type { Location } from "@shared/schema";

interface ReportsPageProps {
  tenantId: number;
}

type ReportRow = {
  orderId: number;
  date: string;
  locationName: string;
  productName: string;
  sku: string;
  group: string | null;
  quantity: number;
  status: string;
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "printed", label: "Printed" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 20;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  printed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  fulfilled: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  processing: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  testId,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    onChange(selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-normal"
          data-testid={testId}
        >
          <span className="truncate">
            {selected.length === 0 ? `All ${label}` : `${selected.length} ${label} selected`}
          </span>
          <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-2" align="start">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">No options available</p>
        ) : (
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-0.5 pr-2">
              {options.map(opt => (
                <div
                  key={opt.value}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted cursor-pointer select-none"
                  onClick={() => toggle(opt.value)}
                  data-testid={`option-${testId}-${opt.value}`}
                >
                  <Checkbox
                    checked={selected.includes(opt.value)}
                    className="pointer-events-none"
                  />
                  <span className="text-sm">{opt.label}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        {selected.length > 0 && (
          <>
            <Separator className="my-2" />
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => { onChange([]); }}
            >
              Clear selection
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default function ReportsPage({ tenantId }: ReportsPageProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [page, setPage] = useState(1);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
  });

  const { data: productGroups = [] } = useQuery<string[]>({
    queryKey: [`/api/tenants/${tenantId}/products/groups`],
  });

  const locationOptions = locations.map(l => ({ value: String(l.id), label: l.name }));
  const groupOptions = productGroups.map(g => ({ value: g, label: g }));

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    setPage(1);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      selectedLocations.forEach(id => params.append("locationIds", id));
      selectedGroups.forEach(g => params.append("productGroups", g));
      selectedStatuses.forEach(s => params.append("statuses", s));

      const res = await fetch(`/api/tenants/${tenantId}/reports?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Failed to fetch report");
      }
      const data: ReportRow[] = await res.json();
      setReportData(data);
      setHasGenerated(true);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to generate report. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = () => {
    if (!reportData.length) return;
    const wsData = reportData.map(row => ({
      "Order ID": row.orderId,
      "Date": new Date(row.date).toLocaleDateString(),
      "Time": new Date(row.date).toLocaleTimeString(),
      "Location": row.locationName,
      "Product": row.productName,
      "SKU": row.sku,
      "Group": row.group ?? "",
      "Quantity": row.quantity,
      "Status": row.status,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders Report");
    XLSX.writeFile(wb, `orders-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const totalPages = Math.max(1, Math.ceil(reportData.length / PAGE_SIZE));
  const pagedData = reportData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-reports-title">
              Reports
            </h1>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Analyze order history with configurable filters.
          </p>
        </div>
        {hasGenerated && reportData.length > 0 && (
          <Button
            variant="outline"
            onClick={handleExport}
            data-testid="button-export-excel"
          >
            <Download className="h-4 w-4 mr-2" />
            Export to Excel
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                data-testid="input-report-start-date"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                data-testid="input-report-end-date"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Locations</label>
              <MultiSelect
                label="Locations"
                options={locationOptions}
                selected={selectedLocations}
                onChange={setSelectedLocations}
                testId="select-report-locations"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Product Groups</label>
              <MultiSelect
                label="Groups"
                options={groupOptions}
                selected={selectedGroups}
                onChange={setSelectedGroups}
                testId="select-report-groups"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Order Status</label>
              <MultiSelect
                label="Statuses"
                options={STATUS_OPTIONS}
                selected={selectedStatuses}
                onChange={setSelectedStatuses}
                testId="select-report-statuses"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              data-testid="button-generate-report"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isGenerating ? "Generating…" : "Generate Report"}
            </Button>
            {hasGenerated && (
              <span className="text-sm text-muted-foreground" data-testid="text-report-count">
                {reportData.length} row{reportData.length !== 1 ? "s" : ""} found
              </span>
            )}
          </div>

          {generateError && (
            <p className="text-sm text-destructive" data-testid="text-report-error">
              {generateError}
            </p>
          )}
        </CardContent>
      </Card>

      {isGenerating && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {["Order ID", "Date", "Location", "Product", "SKU", "Group", "Qty", "Status"].map(h => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5].map(i => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isGenerating && hasGenerated && reportData.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FileX className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No data found</p>
            <p className="text-sm text-muted-foreground">Try adjusting your filters and generating the report again.</p>
          </CardContent>
        </Card>
      )}

      {!isGenerating && hasGenerated && reportData.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedData.map((row, idx) => (
                  <TableRow key={`${row.orderId}-${idx}`} data-testid={`row-report-${idx}`}>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-0.5 rounded">#{row.orderId}</code>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(row.date).toLocaleDateString()} {new Date(row.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell className="text-sm">{row.locationName}</TableCell>
                    <TableCell className="text-sm font-medium max-w-[200px] truncate">{row.productName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.sku}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.group ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">{row.quantity}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[row.status] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {row.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} ({reportData.length} total rows)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    data-testid="button-report-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    data-testid="button-report-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
