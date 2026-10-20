"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className = "",
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>): React.ReactElement {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="curio-dialog-overlay fixed inset-0 z-[100] bg-black/30 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={`curio-dialog-content fixed left-1/2 top-1/2 z-[101] max-h-[calc(100svh-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] border border-[#e7e7e7] bg-white text-[#292929] shadow-[0_24px_90px_#0002] outline-none ${className}`}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
