"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
};

const variants = {
  default: "bg-[#222] text-white hover:bg-[#393939]",
  outline: "border border-[#e5e5e5] bg-white text-[#333] hover:bg-[#f7f7f7]",
  ghost: "bg-transparent text-[#444] hover:bg-[#f4f4f4]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", variant = "default", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e98470] disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
});
