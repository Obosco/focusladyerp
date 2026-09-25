import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine, Search, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BarcodeScannerProps = {
  value: string;
  onChange: (value: string) => void;
  onScan: (value: string) => void;
  label?: string;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
};

export function BarcodeInput({
  value,
  onChange,
  onScan,
  label = "Barcode",
  placeholder = "Scan or type a barcode",
  loading = false,
  disabled = false,
}: BarcodeScannerProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleSubmit = () => {
    const clean = localValue.trim();
    if (!clean) return;
    onChange(clean);
    onScan(clean);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="barcode-input">{label}</Label>
      <div className="flex gap-2">
        <Input
          id="barcode-input"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button type="button" onClick={handleSubmit} disabled={disabled || loading || !localValue.trim()}>
          {loading ? "Checking..." : "Lookup"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Supported formats: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, QR Code.</p>
    </div>
  );
}

export function BarcodeScanner({
  value,
  onChange,
  onScan,
  label,
  placeholder,
  loading = false,
  disabled = false,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerBufferRef = useRef("");
  const scannerTimerRef = useRef<number | null>(null);
  const [cameraMessage, setCameraMessage] = useState("Point camera at a barcode to scan.");
  const [scanPulse, setScanPulse] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraMessage("Camera access is not available on this browser.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((media) => {
        stream = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
        }
        setCameraMessage("Camera ready for barcode scanning.");
      })
      .catch(() => {
        setCameraMessage("Camera permission denied or device unavailable.");
      });

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    const flushBuffer = () => {
      const next = scannerBufferRef.current.trim();
      scannerBufferRef.current = "";
      if (!next) return;
      onChange(next);
      onScan(next);
      setScanPulse(true);
      window.setTimeout(() => setScanPulse(false), 220);
    };

    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        flushBuffer();
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        flushBuffer();
        return;
      }

      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (!/[A-Za-z0-9]/.test(event.key)) {
        return;
      }

      scannerBufferRef.current += event.key;
      if (scannerTimerRef.current) window.clearTimeout(scannerTimerRef.current);
      scannerTimerRef.current = window.setTimeout(flushBuffer, 180);
    };

    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("keydown", keyHandler);
      if (scannerTimerRef.current) window.clearTimeout(scannerTimerRef.current);
    };
  }, [onChange, onScan]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border border-border bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="h-56 w-full object-cover" />
      </div>
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <ScanLine className="h-4 w-4" />
          {cameraMessage}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <Camera className="h-3.5 w-3.5" />
          Camera, USB scanner, and manual entry are supported.
        </div>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? "Scan or type barcode"}
            className="pl-8"
            disabled={disabled}
          />
        </div>
        <Button
          type="button"
          variant={scanPulse ? "default" : "outline"}
          onClick={() => {
            const clean = value.trim();
            if (!clean) return;
            onScan(clean);
          }}
          disabled={disabled || loading || !value.trim()}
        >
          {loading ? "Scanning..." : "Scan"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        The scanner accepts common product codes and variant barcodes. Duplicate scans are ignored after a successful lookup.
      </p>
    </div>
  );
}

export function BarcodeLookup({
  match,
  emptyMessage = "No product matched yet.",
}: {
  match: null | {
    product: string;
    variant: string;
    sku: string;
    barcode: string;
    category: string;
    brand: string;
    stock: string;
    minimumStock: string;
    warehouse: string;
    sellingPrice: string;
    costPrice: string;
    unit: string;
  };
}) {
  if (!match) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        <ShieldAlert className="h-4 w-4" />
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><span className="text-xs text-muted-foreground">Product</span><p className="font-medium">{match.product}</p></div>
      <div><span className="text-xs text-muted-foreground">Variant</span><p className="font-medium">{match.variant}</p></div>
      <div><span className="text-xs text-muted-foreground">SKU</span><p className="font-medium">{match.sku}</p></div>
      <div><span className="text-xs text-muted-foreground">Barcode</span><p className="font-medium">{match.barcode}</p></div>
      <div><span className="text-xs text-muted-foreground">Category</span><p className="font-medium">{match.category || "-"}</p></div>
      <div><span className="text-xs text-muted-foreground">Brand</span><p className="font-medium">{match.brand || "-"}</p></div>
      <div><span className="text-xs text-muted-foreground">Current stock</span><p className="font-medium">{match.stock}</p></div>
      <div><span className="text-xs text-muted-foreground">Minimum stock</span><p className="font-medium">{match.minimumStock}</p></div>
      <div><span className="text-xs text-muted-foreground">Warehouse</span><p className="font-medium">{match.warehouse || "Main Store"}</p></div>
      <div><span className="text-xs text-muted-foreground">Unit</span><p className="font-medium">{match.unit || "pcs"}</p></div>
      <div><span className="text-xs text-muted-foreground">Selling price</span><p className="font-medium">₹{match.sellingPrice}</p></div>
      <div><span className="text-xs text-muted-foreground">Cost price</span><p className="font-medium">₹{match.costPrice}</p></div>
    </div>
  );
}
