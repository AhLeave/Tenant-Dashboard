import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  BarChart3, ChevronDown, Download, FileX, Loader2, RefreshCw,
  ChevronLeft, ChevronRight, CalendarClock, Trash2, Plus, ChevronUp,
  Receipt,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Location, ReportSchedule, InvoicingLocation } from "@shared/schema";

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
};

function formatCurrency(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

function MultiSelect({
  label, options, selected, onChange, testId,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal" data-testid={testId}>
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
                  <Checkbox checked={selected.includes(opt.value)} className="pointer-events-none" />
                  <span className="text-sm">{opt.label}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        {selected.length > 0 && (
          <>
            <Separator className="my-2" />
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => onChange([])}>
              Clear selection
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function OrderReportTab({ tenantId, locations, productGroups }: { tenantId: number; locations: Location[]; productGroups: string[] }) {
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
      const res = await fetch(`/api/tenants/${tenantId}/reports?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed to fetch report");
      setReportData(await res.json());
      setHasGenerated(true);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to generate report.");
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
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3">
        {hasGenerated && reportData.length > 0 && (
          <Button variant="outline" onClick={handleExport} data-testid="button-export-excel">
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
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="input-report-start-date" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">End Date</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} data-testid="input-report-end-date" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Locations</label>
              <MultiSelect label="Locations" options={locationOptions} selected={selectedLocations} onChange={setSelectedLocations} testId="select-report-locations" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Product Groups</label>
              <MultiSelect label="Groups" options={groupOptions} selected={selectedGroups} onChange={setSelectedGroups} testId="select-report-groups" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Order Status</label>
              <MultiSelect label="Statuses" options={STATUS_OPTIONS} selected={selectedStatuses} onChange={setSelectedStatuses} testId="select-report-statuses" />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleGenerate} disabled={isGenerating} data-testid="button-generate-report">
              {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {isGenerating ? "Generating…" : "Generate Report"}
            </Button>
            {hasGenerated && (
              <span className="text-sm text-muted-foreground" data-testid="text-report-count">
                {reportData.length} row{reportData.length !== 1 ? "s" : ""} found
              </span>
            )}
          </div>
          {generateError && <p className="text-sm text-destructive" data-testid="text-report-error">{generateError}</p>}
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[row.status] ?? "bg-muted text-muted-foreground"}`}>
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
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} data-testid="button-report-prev-page">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} data-testid="button-report-next-page">
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

function InvoicingTab({ tenantId }: { tenantId: number }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [invoiceData, setInvoiceData] = useState<InvoicingLocation[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/tenants/${tenantId}/invoicing?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed to fetch invoicing data");
      setInvoiceData(await res.json());
      setHasGenerated(true);
      setExpandedIds(new Set());
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to generate invoicing report.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = () => {
    if (!invoiceData.length) return;
    const rows: Record<string, unknown>[] = [];
    for (const loc of invoiceData) {
      rows.push({
        "Ward / Location": loc.locationName,
        "Total Orders Fulfilled": loc.totalOrders,
        "Total Invoice Amount": (loc.totalAmount / 100).toFixed(2),
        "Product": "",
        "SKU": "",
        "Unit Price": "",
        "Qty": "",
        "Line Total": "",
      });
      for (const item of loc.items) {
        rows.push({
          "Ward / Location": "",
          "Total Orders Fulfilled": "",
          "Total Invoice Amount": "",
          "Product": item.productName,
          "SKU": item.sku,
          "Unit Price": (item.unitPrice / 100).toFixed(2),
          "Qty": item.totalQuantity,
          "Line Total": (item.lineTotal / 100).toFixed(2),
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoicing");
    XLSX.writeFile(wb, `invoicing-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const grandTotal = invoiceData.reduce((sum, loc) => sum + loc.totalAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3">
        {hasGenerated && invoiceData.length > 0 && (
          <Button variant="outline" onClick={handleExport} data-testid="button-export-invoicing">
            <Download className="h-4 w-4 mr-2" />
            Export to Excel
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Date Range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Start Date</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="input-invoice-start-date" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">End Date</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} data-testid="input-invoice-end-date" />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleGenerate} disabled={isGenerating} data-testid="button-generate-invoicing">
              {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
              {isGenerating ? "Generating…" : "Generate Invoice Report"}
            </Button>
            {hasGenerated && (
              <span className="text-sm text-muted-foreground">
                {invoiceData.length} location{invoiceData.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {generateError && <p className="text-sm text-destructive">{generateError}</p>}
        </CardContent>
      </Card>

      {isGenerating && (
        <Card>
          <CardContent className="space-y-3 py-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      )}

      {!isGenerating && hasGenerated && invoiceData.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
            <Receipt className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No fulfilled orders in this period</p>
            <p className="text-sm text-muted-foreground">Only orders with status "Fulfilled" appear in invoicing.</p>
          </CardContent>
        </Card>
      )}

      {!isGenerating && hasGenerated && invoiceData.length > 0 && (
        <div className="space-y-2">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Ward / Location</TableHead>
                    <TableHead className="text-center">Orders Fulfilled</TableHead>
                    <TableHead className="text-right">Total Invoice Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceData.map((loc) => (
                    <>
                      <TableRow
                        key={loc.locationId}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleExpand(loc.locationId)}
                        data-testid={`row-invoice-location-${loc.locationId}`}
                      >
                        <TableCell className="text-muted-foreground">
                          {expandedIds.has(loc.locationId)
                            ? <ChevronUp className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />
                          }
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-invoice-location-${loc.locationId}`}>
                          {loc.locationName}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{loc.totalOrders}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold" data-testid={`text-invoice-amount-${loc.locationId}`}>
                          {formatCurrency(loc.totalAmount)}
                        </TableCell>
                      </TableRow>
                      {expandedIds.has(loc.locationId) && (
                        <TableRow key={`${loc.locationId}-items`}>
                          <TableCell colSpan={4} className="p-0 bg-muted/30">
                            <div className="px-8 py-3">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b text-muted-foreground">
                                    <th className="text-left py-1.5 font-medium">Product</th>
                                    <th className="text-left py-1.5 font-medium">SKU</th>
                                    <th className="text-right py-1.5 font-medium">Unit Price</th>
                                    <th className="text-right py-1.5 font-medium">Qty</th>
                                    <th className="text-right py-1.5 font-medium">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {loc.items.map((item) => (
                                    <tr key={item.productId} className="border-b last:border-0">
                                      <td className="py-1.5">{item.productName}</td>
                                      <td className="py-1.5 font-mono text-xs text-muted-foreground">{item.sku}</td>
                                      <td className="py-1.5 text-right">{formatCurrency(item.unitPrice)}</td>
                                      <td className="py-1.5 text-right font-medium">{item.totalQuantity}</td>
                                      <td className="py-1.5 text-right font-semibold">{formatCurrency(item.lineTotal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                <span className="text-sm font-semibold">Grand Total</span>
                <span className="text-base font-bold" data-testid="text-invoice-grand-total">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ScheduleDialog({ tenantId, open, onClose }: { tenantId: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [frequency, setFrequency] = useState<"WEEKLY" | "MONTHLY">("MONTHLY");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);

  const { data: schedules = [], refetch } = useQuery<ReportSchedule[]>({
    queryKey: ["/api/tenants", tenantId, "report-schedules"],
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tenants/${tenantId}/report-schedules`, {
      reportType: "INVOICING",
      frequency,
      recipientEmails: emails,
    }),
    onSuccess: () => {
      toast({ title: "Schedule created" });
      setEmails([]);
      setEmailInput("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "report-schedules"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create schedule", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tenants/${tenantId}/report-schedules/${id}`),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "report-schedules"] });
    },
    onError: () => {
      toast({ title: "Failed to delete schedule", variant: "destructive" });
    },
  });

  const addEmail = () => {
    const val = emailInput.trim();
    if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    if (!emails.includes(val)) setEmails(prev => [...prev, val]);
    setEmailInput("");
  };

  const removeEmail = (email: string) => setEmails(prev => prev.filter(e => e !== email));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[520px]" data-testid="dialog-schedule-report">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Schedule Invoicing Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Frequency</label>
            <div className="flex gap-2">
              {(["WEEKLY", "MONTHLY"] as const).map(f => (
                <Button
                  key={f}
                  variant={frequency === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFrequency(f)}
                  data-testid={`button-frequency-${f.toLowerCase()}`}
                >
                  {f === "WEEKLY" ? "Weekly (Mondays)" : "Monthly (1st)"}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {frequency === "WEEKLY" ? "Report sent every Monday at 7:00 AM" : "Report sent on the 1st of every month at 7:00 AM"}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Recipient Emails</label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="name@hospital.ie"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                data-testid="input-schedule-email"
              />
              <Button variant="outline" size="icon" onClick={addEmail} data-testid="button-add-email">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {emails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {emails.map(email => (
                  <Badge key={email} variant="secondary" className="gap-1.5 pr-1">
                    {email}
                    <button onClick={() => removeEmail(email)} className="hover:text-destructive">
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={emails.length === 0 || createMutation.isPending}
              data-testid="button-save-schedule"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Schedule
            </Button>
          </DialogFooter>

          {schedules.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Active Schedules</p>
                {schedules.map(s => (
                  <div key={s.id} className="flex items-start justify-between gap-3 p-3 rounded-md border bg-muted/30" data-testid={`card-schedule-${s.id}`}>
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{s.frequency}</Badge>
                        <span className="text-xs text-muted-foreground">{s.reportType}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        To: {(s.recipientEmails as string[]).join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Next: {new Date(s.nextRunDate).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteMutation.mutate(s.id)}
                      data-testid={`button-delete-schedule-${s.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ReportsPage({ tenantId }: ReportsPageProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
  });

  const { data: productGroups = [] } = useQuery<string[]>({
    queryKey: [`/api/tenants/${tenantId}/products/groups`],
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-reports-title">Reports</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Analyze order history and generate invoicing for cross-charging.
          </p>
        </div>
        <Button variant="outline" onClick={() => setScheduleOpen(true)} data-testid="button-schedule-report">
          <CalendarClock className="h-4 w-4 mr-2" />
          Schedule Report
        </Button>
      </div>

      <Tabs defaultValue="order-report">
        <TabsList data-testid="tabs-reports">
          <TabsTrigger value="order-report" data-testid="tab-order-report">Order Report</TabsTrigger>
          <TabsTrigger value="invoicing" data-testid="tab-invoicing">Invoicing</TabsTrigger>
        </TabsList>

        <TabsContent value="order-report" className="mt-6">
          <OrderReportTab tenantId={tenantId} locations={locations} productGroups={productGroups} />
        </TabsContent>

        <TabsContent value="invoicing" className="mt-6">
          <InvoicingTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>

      <ScheduleDialog tenantId={tenantId} open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </div>
  );
}
