import Link from "next/link";

export default function HomePage() {
  return (
    <main className="marketHome">
      <section className="heroGrid" aria-labelledby="home-title">
        <div className="heroCopy">
          <span className="kicker">Built for Nigerian commerce</span>
          <h1 className="heroTitle" id="home-title">One marketplace. Many local businesses.</h1>
          <p className="heroLead">
            CartNest brings products from independent Nigerian stores into one customer experience,
            while each business keeps control of its catalog, inventory and fulfillment.
          </p>
          <div className="heroActions">
            <Link className="primaryButton" href="/marketplace">Browse marketplace</Link>
            <Link className="secondaryButton" href="/vendor">Sell on CartNest</Link>
          </div>
        </div>

        <aside className="heroPanel" aria-label="Marketplace foundations">
          <h2>Designed around the way local commerce actually works</h2>
          <ul className="trustList">
            <li><span className="trustIcon">₦</span><div><strong>Naira-first checkout</strong><span>Server-calculated pricing, fees, tax and discounts in integer minor units.</span></div></li>
            <li><span className="trustIcon">↗</span><div><strong>Multiple stores, one cart</strong><span>Orders split cleanly by store without making the customer manage separate checkouts.</span></div></li>
            <li><span className="trustIcon">✓</span><div><strong>Verified payment state</strong><span>CartNest confirms provider evidence before an order receives fulfillment value.</span></div></li>
            <li><span className="trustIcon">⌁</span><div><strong>Local fulfillment</strong><span>Provider delivery and vendor-managed delivery share one tracking model.</span></div></li>
          </ul>
        </aside>
      </section>

      <section className="featureSection" aria-labelledby="experience-title">
        <div className="sectionHeading">
          <h2 id="experience-title">A marketplace with clear ownership.</h2>
          <p>Buyers get one coherent shopping experience. Vendors operate their own stores. CartNest handles the shared marketplace rules between them.</p>
        </div>
        <div className="featureGrid">
          <article className="featureCard"><span className="featureIndex">01</span><h3>For buyers</h3><p>Discover products, keep a wishlist, build a multi-store cart, pay securely and track each shipment from one account.</p></article>
          <article className="featureCard"><span className="featureIndex">02</span><h3>For businesses</h3><p>Manage stores, products, variants, stock, staff, fulfillment and returns without losing vendor-level ownership boundaries.</p></article>
          <article className="featureCard"><span className="featureIndex">03</span><h3>For marketplace operations</h3><p>Moderation, payments, refunds, KYC, tax, promotions and customer cases remain auditable from the admin side.</p></article>
        </div>
      </section>
    </main>
  );
}
