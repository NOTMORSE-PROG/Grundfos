"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Camera, X, Loader2 } from "lucide-react";

interface ImageUploadProps {
  onImageProcessed: (result: {
    imageUrl: string;
    ocrText: string;
    parsedInfo: Record<string, string | null>;
  }) => void;
  disabled?: boolean;
}

export function ImageUpload({ onImageProcessed, disabled }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setUploading(true);

    try {
      // Upload via UploadThing
      const formData = new FormData();
      formData.append("file", file);

      // Use the UploadThing endpoint
      const uploadRes = await fetch("/api/uploadthing", {
        method: "POST",
        body: formData,
      });

      let imageUrl: string;

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        imageUrl = uploadData[0]?.url || uploadData.url;
      } else {
        // Fallback: use data URL for OCR if upload fails
        imageUrl = preview!;
      }

      // Process OCR
      const ocrRes = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });

      if (ocrRes.ok) {
        const ocrData = await ocrRes.json();
        onImageProcessed({
          imageUrl,
          ocrText: ocrData.extracted_text,
          parsedInfo: ocrData.parsed_info,
        });
      } else {
        onImageProcessed({
          imageUrl,
          ocrText: "OCR processing failed. Please describe the pump manually.",
          parsedInfo: {},
        });
      }
    } catch {
      onImageProcessed({
        imageUrl: preview || "",
        ocrText: "Upload failed. Please describe the pump manually.",
        parsedInfo: {},
      });
    } finally {
      setUploading(false);
      setPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const cancelUpload = () => {
    setPreview(null);
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      {preview && (
        <div className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-lg p-2 shadow-lg">
          <div className="relative">
            <Image
              src={preview}
              alt="Preview"
              width={96}
              height={96}
              className="w-24 h-24 object-cover rounded"
              unoptimized
            />
            {uploading ? (
              <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            ) : (
              <button
                onClick={cancelUpload}
                className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {uploading && (
            <p className="text-xs text-muted-foreground mt-1">
              Analyzing...
            </p>
          )}
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-grundfos-blue"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || uploading}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
