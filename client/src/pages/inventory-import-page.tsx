import { useState, useCallback } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Upload, FileSpreadsheet, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

interface ParsedProduct {
  name: string;
  sku: string;
  price: number;
  group: string;
  locationNames: string[];
  valid: boolean;
  errors: string[];
}

interface InventoryImportPageProps {
  tenantId: number;
}

const SKIP_COLS = new Set(["Product Group", "Product Name", "SKU", "Price per Unit", "ALL"]);

function parseFullExcelFile(file: File): Promise<ParsedProduct[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (rows.length === 0) { resolve([]); return; }

        const locationCols = Object.keys(rows[0]).filter((c) => !SKIP_COLS.has(c));

        const parsed: ParsedProduct[] = rows.map((row) => {
          const errors: string[] = [];
          const name = String(row["Product Name"] ?? row["name"] ?? row["Name"] ?? "").trim();
          const sku = String(row["SKU"] ?? row["sku"] ?? row["Sku"] ?? "").trim();
          const group = String(row["Product Group"] ?? row["group"] ?? row["Group"] ?? "").trim();
          const rawPrice = row["Price per Unit"] ?? row["price"] ?? row["Price"] ?? 0;
          const price = parseFloat(String(rawPrice).replace(/[$,]/g, ""));

          if (!name) errors.push("Name is required");
          if (!sku) errors.push("SKU is required");
          if (isNaN(price) || price < 0) errors.push("Invalid price");

          const locationNames = locationCols.filter((col) => {
            const val = String(row[col] ?? "").toUpperCase().trim();
            return val === "YES" || val === "Y";
          });

          return {
            name,
            sku,
            price: isNaN(price) ? 0 : price,
            group,
            locationNames,
            valid: errors.length === 0,
            errors,
          };
        });

        resolve(parsed);
      } catch (err) {
        reject(new Error("Failed to parse Excel file. Please ensure it is a valid .xlsx file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

export default function InventoryImportPage({ tenantId }: InventoryImportPageProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedProduct[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [replaceAll, setReplaceAll] = useState(false);
  const { toast } = useToast();

  const validRows = parsedRows?.filter((r) => r.valid) ?? [];
  const invalidRows = parsedRows?.filter((r) => !r.valid) ?? [];

  const totalLocations = validRows.reduce((s, r) => s + r.locationNames.length, 0);

  const importMutation = useMutation({
    mutationFn: async () => {
      const products = validRows.map((r) => ({
        name: r.name,
        sku: r.sku,
        price: r.price,
        group: r.group || null,
        locationNames: r.locationNames,
      }));
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/products/import-full`, {
        products,
        replaceAll,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "products"] });
      toast({
        title: "Import successful",
        description: `${data.count} product${data.count !== 1 ? "s" : ""} imported with location assignments.`,
      });
      setFile(null);
      setParsedRows(null);
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.endsWith(".xlsx") && !f.name.endsWith(".xls")) {
      setParseError("Only .xlsx or .xls files are supported.");
      setFile(null);
      setParsedRows(null);
      return;
    }
    setFile(f);
    setParseError(null);
    setParsedRows(null);
    try {
      const rows = await parseFullExcelFile(f);
      if (rows.length === 0) { setParseError("The spreadsheet appears to be empty."); return; }
      setParsedRows(rows);
    } catch (err: any) {
      setParseError(err.message);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  }, [handleFile]);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
    e.target.value = "";
  };

  const reset = () => { setFile(null); setParsedRows(null); setParseError(null); };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inventory" data-testid="link-back-to-inventory">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-import-title">Import Products</h1>
          <p className="text-muted-foreground text-sm">Upload an Excel spreadsheet to bulk import products with location assignments</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expected Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Columns A–D are product details. Column E onwards are location names (YES / NO per cell).
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              ["Product Group", "Category / group name"],
              ["Product Name", "Display name"],
              ["SKU", "Unique product code"],
              ["Price per Unit", "e.g. 1.99"],
              ["Location columns…", "YES or NO per location"],
            ].map(([col, desc]) => (
              <div key={col} className="flex items-center gap-2 bg-muted rounded-md px-3 py-1.5">
                <code className="text-xs font-mono font-semibold">{col}</code>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {!parsedRows && (
        <Card>
          <CardContent className="pt-6">
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-md py-14 gap-4 transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border"}`}
              onClick={() => document.getElementById("file-input")?.click()}
              data-testid="dropzone-upload"
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-full ${isDragging ? "bg-primary/10" : "bg-muted"}`}>
                <Upload className={`h-6 w-6 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">{isDragging ? "Drop your file here" : "Drag & drop your spreadsheet here"}</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse — .xlsx and .xls supported</p>
              </div>
              <input id="file-input" type="file" accept=".xlsx,.xls" className="sr-only" onChange={onFileInput} data-testid="input-file-upload" />
            </div>
            {parseError && (
              <div className="mt-4 flex items-start gap-3 rounded-md bg-destructive/10 p-4 text-destructive">
                <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                <p className="text-sm">{parseError}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {parsedRows && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">{file?.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{parsedRows.length} rows · {totalLocations.toLocaleString()} location assignments</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={reset} data-testid="button-reset-file">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-chart-3" />
                  <span className="text-sm font-medium">{validRows.length} valid</span>
                </div>
                {invalidRows.length > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium">{invalidRows.length} invalid (will be skipped)</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
                <Switch
                  id="replace-all"
                  checked={replaceAll}
                  onCheckedChange={setReplaceAll}
                  data-testid="switch-replace-all"
                />
                <div>
                  <Label htmlFor="replace-all" className="text-sm font-medium cursor-pointer">
                    Replace existing products
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {replaceAll
                      ? "All current products and their location assignments will be deleted before import."
                      : "New products will be added alongside existing ones."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Locations</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, i) => (
                    <TableRow key={i} className={!row.valid ? "opacity-50" : ""} data-testid={`row-preview-${i}`}>
                      <TableCell>
                        {row.valid
                          ? <CheckCircle className="h-4 w-4 text-chart-3" />
                          : <AlertCircle className="h-4 w-4 text-destructive" />}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.group || <span className="italic">—</span>}</TableCell>
                      <TableCell className="font-medium">{row.name || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                      <TableCell>
                        {row.sku
                          ? <code className="text-xs bg-muted px-2 py-1 rounded-md">{row.sku}</code>
                          : <span className="text-muted-foreground italic text-sm">empty</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.valid ? `€${row.price.toFixed(2)}` : <span className="text-muted-foreground italic text-sm">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{row.locationNames.length} locations</Badge>
                      </TableCell>
                      <TableCell>
                        {row.errors.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {row.errors.map((err, j) => (
                              <Badge key={j} variant="destructive" className="text-xs">{err}</Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {validRows.length > 0
                ? `${validRows.length} product${validRows.length !== 1 ? "s" : ""} will be imported${replaceAll ? ", replacing all existing products" : ""}`
                : "No valid rows to import"}
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={reset} data-testid="button-cancel-import">Cancel</Button>
              <Button
                disabled={validRows.length === 0 || importMutation.isPending}
                onClick={() => importMutation.mutate()}
                data-testid="button-confirm-import"
              >
                {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import {validRows.length} Product{validRows.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
