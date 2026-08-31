import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dockhand",
  description: "Shopify orders, synced into ClickUp and Monday tasks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          App Bridge. This registers the Polaris web components (s-page,
          s-select, ...) and exposes window.shopify, which client components use
          to fetch a fresh session token. Without it the s-* tags render as
          unknown elements and nothing is styled.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts --
            App Bridge must load synchronously and before any app code; adding
            async/defer makes window.shopify undefined on first render and the
            s-* components render unregistered. */}
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          data-api-key={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
