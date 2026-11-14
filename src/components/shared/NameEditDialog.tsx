"use client";

import { useState } from "react";
import { DialogActions } from "@/components/shared/DialogActions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

type NameEditDialogProps = {
  title: string;
  inputId: string;
  initialName: string;
  /** Toast shown after a successful save, e.g. "Account renamed". */
  successMessage: string;
  label?: string;
  minLength?: number;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<void>;
};

/**
 * Inline rename dialog for accounts and providers. Mount it fresh (with `key`
 * or a conditional render) so `initialName` seeds the field without an effect.
 */
export function NameEditDialog({
  title,
  inputId,
  initialName,
  successMessage,
  label = "Name",
  minLength = 2,
  onOpenChange,
  onSave,
}: NameEditDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const trimmed = name.trim();
  const valid = trimmed.length >= minLength;

  const submit = async () => {
    if (!valid) {
      setError(`Use at least ${minLength} characters.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(trimmed);
      toast({ title: successMessage, variant: "success" });
      onOpenChange(false);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      toast({ title: "Rename failed", description: message, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-zinc-900 text-white">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={inputId}>{label}</Label>
          <Input
            id={inputId}
            value={name}
            onChange={(event) => { setName(event.target.value); setError(""); }}
            autoFocus
          />
          {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        </div>
        <DialogActions
          onCancel={() => onOpenChange(false)}
          onSubmit={() => void submit()}
          submitLabel="Save"
          disabled={!valid}
          saving={saving}
        />
      </DialogContent>
    </Dialog>
  );
}
