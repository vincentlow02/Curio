"use client";

import * as SeparatorPrimitive from "@radix-ui/react-separator";

export function Separator({ className = "" }: { className?: string }): React.ReactElement {
  return (
    <SeparatorPrimitive.Root
      decorative
      orientation="horizontal"
      className={`h-px w-full shrink-0 bg-[#eeeeee] ${className}`}
    />
  );
}
