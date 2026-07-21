"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { getSignedDownloadUrl } from "@/server/actions/documents";

export function DocumentDownloadButton({ documentId }: { documentId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const downloadWindow = window.open("about:blank", "_blank");
    if (!downloadWindow) {
      setError("Allow pop-ups to download this document.");
      return;
    }

    downloadWindow.opener = null;
    setLoading(true);
    setError(null);
    const { url, error: err } = await getSignedDownloadUrl(documentId);
    setLoading(false);
    if (err || !url) {
      downloadWindow.close();
      setError(err ?? "Could not generate download link.");
      return;
    }
    downloadWindow.location.href = url;
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50"
      >
        <Download aria-hidden="true" className="size-3.5" />
        {loading ? "Generating…" : "Download"}
      </button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
