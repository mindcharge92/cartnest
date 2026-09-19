import Link from "next/link";

const shopLinks = [
  ["Marketplace", "/marketplace"],
  ["New arrivals", "/marketplace?sort=NEWEST"],
  ["Saved items", "/wishlist"],
  ["Your cart", "/cart"],
] as const;

const accountLinks = [
  ["Your account", "/account"],
  ["Orders", "/orders"],
  ["Returns", "/returns"],
  ["Notifications", "/notifications"],
] as const;

export function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div className="siteFooterInner">
        <div className="footerBrand">
          <Link className="brand" href="/" aria-label="CartNest home">
            <span className="brandMark" aria-hidden="true">C</span>
            <span className="brandLockup"><strong>CartNest</strong><small>Shop. Support. Grow.</small></span>
          </Link>
          <p>A trusted marketplace for discovering products from independent Nigerian businesses.</p>
          <div className="footerAssurances" aria-label="Shopping assurances">
            <span>Secure checkout</span>
            <span>Clear store ownership</span>
            <span>Order tracking</span>
          </div>
        </div>

        <nav className="footerLinkGroup" aria-label="Shop links">
          <strong>Shop</strong>
          {shopLinks.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>

        <nav className="footerLinkGroup" aria-label="Account links">
          <strong>Account</strong>
          {accountLinks.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>

        <div className="footerSeller">
          <strong>Grow with CartNest</strong>
          <p>Run your catalogue, inventory and orders from one seller workspace.</p>
          <Link href="/vendor">Start selling <span aria-hidden="true">→</span></Link>
        </div>
      </div>
      <div className="footerBottom">
        <span>© {new Date().getFullYear()} CartNest</span>
        <span>Built for Nigerian commerce.</span>
      </div>
    </footer>
  );
}
