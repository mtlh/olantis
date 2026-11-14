"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DialogActionsProps = {
  onCancel: () => void;
  submitLabel: string;
  onSubmit: () => void;
  saving?: boolean;
  disabled?: boolean;
  cancelLabel?: string;
  submitIcon?: ReactNode;
  submitClassName?: string;
  savingLabel?: string;
  className?: string;
};

/**
 * Cancel + primary action footer shared by every form dialog. The spinner and
 * disabled state are handled here so no dialog forgets one of them.
 */
export function DialogActions({
  onCancel,
  submitLabel,
  onSubmit,
  saving = false,
  disabled = false,
  cancelLabel = "Cancel",
  submitIcon,
  submitClassName,
  savingLabel = "Saving…",
  className,
}: DialogActionsProps) {
  return (
    <div className={cn("mt-6 flex justify-end gap-2", className)}>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
        {cancelLabel}
      </Button>
      <Button type="button" onClick={onSubmit} disabled={saving || disabled} className={submitClassName}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : submitIcon}
        {saving ? savingLabel : submitLabel}
      </Button>
    </div>
  );
}
