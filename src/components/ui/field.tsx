import {
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const fieldClass =
  "min-h-11 w-full rounded-md border-0 bg-field px-3.5 py-2.5 text-field-ink shadow-[0_0_0_1px_var(--color-border)] outline-none transition-[box-shadow] duration-150 placeholder:text-subtle focus:shadow-[0_0_0_2px_var(--color-primary)]";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-stage-ink", className)} {...props} />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, props.className)} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, props.className)} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, "min-h-28", props.className)} {...props} />;
}

export function Help({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs leading-5 text-stage-muted">{children}</p>;
}
