import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-bold tracking-[0.02em] transition-[transform,background-color,border-color,box-shadow,opacity] duration-200 ease-out active:not-disabled:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 min-h-11 px-5 text-sm",
  {
    variants: {
      variant: {
        primary:
          "border border-primary/60 bg-primary text-primary-fg shadow-[0_14px_34px_rgba(213,170,106,0.18),inset_0_1px_0_rgba(255,255,255,0.34)] hover:-translate-y-0.5 hover:bg-primary-2 hover:shadow-[0_18px_44px_rgba(213,170,106,0.25),inset_0_1px_0_rgba(255,255,255,0.36)]",
        secondary:
          "border border-white/10 bg-white/[0.055] text-stage-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.085]",
        ghost:
          "border border-transparent text-stage-ink hover:border-white/10 hover:bg-white/[0.045]",
        outline:
          "border border-white/12 bg-white/[0.025] text-stage-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl hover:-translate-y-0.5 hover:border-primary/35 hover:bg-white/[0.06]",
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
