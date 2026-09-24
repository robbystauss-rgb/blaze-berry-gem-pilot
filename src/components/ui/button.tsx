import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-wide transition-[transform,background-color,box-shadow,opacity] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none min-h-11 px-5 text-sm",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-fg shadow-[0_10px_24px_rgba(28,26,24,0.16)] hover:bg-primary-2",
        secondary:
          "bg-stage-photo text-stage-ink ring-1 ring-inset ring-stage-line hover:bg-stage",
        ghost: "text-stage-ink hover:bg-primary/10",
        outline:
          "bg-stage-photo text-stage-ink ring-1 ring-inset ring-stage-line hover:bg-stage",
      },
      size: {
        default: "",
        lg: "min-h-12 px-6 text-base",
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
