import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's default scale, so it misfiles the
// semantic token classes from tailwind.config.ts: an unknown text-<name> is
// read as a COLOUR, which makes cn("text-display", "text-fg") silently drop
// the font size. Registering each custom key in its real group keeps the two.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "title", "page-title"] }],
      rounded: [{ rounded: ["card", "row", "icon", "input", "pill"] }],
      shadow: [{ shadow: ["container", "tap", "icon", "btn", "ghost", "well", "credits", "mark"] }],
      "bg-image": [{ bg: ["fill-btn", "fill-ghost", "fill-tap", "fill-icon", "fill-credits", "page-image"] }],
      "font-family": [{ font: ["head", "body"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
