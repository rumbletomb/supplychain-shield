import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";

export const metadata: Metadata = {
  title: "SupplyChain Shield",
  description: "Developer-first software supply chain security for small teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand" aria-label="SupplyChain Shield dashboard">
            <span className="brandMark">S</span>
            <span>
              <strong>SupplyChain</strong> Shield
            </span>
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="/">Overview</Link>
            <a href="https://github.com/rumbletomb/supplychain-shield">Documentation</a>
          </nav>
          <span className="statusPill">
            <i /> Protection active
          </span>
        </header>
        <main>{children}</main>
        <footer>
          <span>SupplyChain Shield · Open source security for small teams</span>
          <span>Built with least privilege by default</span>
        </footer>
      </body>
    </html>
  );
}
