import { twMerge } from "tailwind-merge";

export function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(inputs.filter(Boolean).join(" "));
}

export function currency(n: number) {
  return `$${n.toFixed(0)}`;
}
