"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DeleteConfirmationDialogProps = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmationText?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
};

export function DeleteConfirmationDialog({
  title,
  description,
  confirmLabel,
  confirmationText,
  onOpenChange,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setSaving(true);
    setError("");
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-white/10 text-white">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-zinc-400">{description}</p>
        {confirmationText != null && (
          <div className="space-y-2">
            <Label>Type <span className="text-white">{confirmationText}</span> to confirm</Label>
            <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder={confirmationText} autoFocus />
          </div>
        )}
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            type="button"
            variant="ghost"
            className="bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/20"
            disabled={saving || (confirmationText != null && input !== confirmationText)}
            onClick={() => void confirm()}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
