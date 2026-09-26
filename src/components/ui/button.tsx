import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-bold tracking-[0.02em] transition-[transform,background-color,border-color,box-shadow,opacity] duration-200 ease-out active:not-disabled:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 min-h-11 px-5 text-sm",
  {
    variants: {
      variant: {
        primary:
          "border border-ink bg-ink text-white shadow-[0_12px_30px_rgba(29,29,31,0.14),inset_0_1px_0_rgba(255,255,255,0.10)] hover:-translate-y-0.5 hover:border-[#2a2a2a] hover:bg-[#2a2a2a] hover:shadow-[0_16px_38px_rgba(29,29,31,0.18)]",
        secondary:
          "border border-primary/30 bg-primary/[0.10] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/[0.15]",
        ghost:
          "border border-transparent text-ink hover:border-border hover:bg-white/70",
        outline:
          "border border-border bg-white/80 text-ink shadow-[0_8px_22px_rgba(45,38,30,0.05),inset_0_1px_0_rgba(255,255,255,0.98)] backdrop-blur-xl hover:-translate-y-0.5 hover:border-primary/35 hover:bg-white",
      },
      size: {
        default: "",
        lg: "min-h-13 px-7 text-[0.95rem]",
        sm: "min-h-10 px-4 text-xs",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
