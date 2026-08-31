/**
 * JSX declarations for the Polaris web components.
 *
 * These are custom elements registered globally by the App Bridge script, so
 * there is no package to import and nothing for TypeScript to infer from.
 * Only the elements this app actually uses are declared, so a typo in a tag
 * name is still a compile error.
 */
import type React from "react";

type El<P = Record<string, unknown>> = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement>,
  HTMLElement
> &
  P;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "s-page": El<{ heading?: string; inlineSize?: "small" | "base" | "large" }>;
      "s-section": El<{ heading?: string; padding?: string }>;
      "s-stack": El<{ direction?: "inline" | "block"; gap?: string; alignItems?: string }>;
      "s-grid": El<{ gridTemplateColumns?: string; gap?: string; alignItems?: string }>;
      "s-box": El<{ padding?: string; background?: string; borderRadius?: string }>;
      "s-heading": El;
      "s-paragraph": El<{ tone?: string; color?: string }>;
      "s-text": El<{ type?: string; tone?: string; color?: string }>;
      "s-link": El<{ href?: string; target?: string; tone?: string }>;
      "s-banner": El<{ heading?: string; tone?: string; dismissible?: boolean }>;
      "s-badge": El<{ tone?: string; icon?: string; size?: string }>;
      "s-button": El<{
        variant?: string;
        tone?: string;
        icon?: string;
        type?: string;
        disabled?: boolean;
        loading?: boolean;
        href?: string;
        target?: string;
      }>;
      "s-select": El<{
        label?: string;
        name?: string;
        value?: string;
        placeholder?: string;
        disabled?: boolean;
      }>;
      "s-option": El<{ value?: string }>;
      "s-text-field": El<{
        label?: string;
        name?: string;
        value?: string;
        placeholder?: string;
        details?: string;
      }>;
      "s-divider": El;
      "s-spinner": El<{ size?: string; accessibilityLabel?: string }>;
    }
  }
}

export {};

declare global {
  interface Window {
    /** Provided by the App Bridge script; mints a fresh session token. */
    shopify?: { idToken(): Promise<string> };
  }
}
