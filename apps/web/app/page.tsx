import Link from "next/link";
import { HomeDiscovery } from "../features/catalog/home-discovery";

const departments = [
  { name: "Phones & tech", query: "phones", tone: "tech", symbol: "01" },
  { name: "Fashion", query: "fashion", tone: "fashion", symbol: "02" },
  { name: "Beauty", query: "beauty", tone: "beauty", symbol: "03" },
  { name: "Home & living", query: "home", tone: "home", symbol: "04" },
  { name: "Groceries", query: "groceries", tone: "grocery", symbol: "05" },
  { name: "Accessories", query: "accessories", tone: "accessory", symbol: "06" },
] as const;

export default function HomePage() {
  return (
    <main className="marketHome">
      <section className="commerceHero" aria-labelledby="home-title">
        <div className="commerceHeroContent">
          <p className="commerceHeroKicker">Discover more. Shop local.</p>
          <h1 id="home-title">Great finds from businesses across Nigeria.</h1>
          <p>Explore everyday essentials, standout pieces and new favourites—all from independent stores.</p>
          <form className="commerceHeroSearch" action="/marketplace">
            <label className="srOnly" htmlFor="hero-search">What are you looking for?</label>
            <input id="hero-search" name="q" placeholder="What are you looking for?" />
            <button type="submit">Search</button>
          </form>
          <div className="commerceHeroLinks">
            <Link href="/marketplace">Shop the marketplace</Link>
            <Link href="/vendor">Open your store</Link>
          </div>
        </div>
      </section>

      <section className="serviceRibbon" aria-label="CartNest shopping benefits">
        <div><strong>Shop independent</strong><span>Discover Nigerian businesses</span></div>
        <div><strong>Clear store ownership</strong><span>Know who fulfils every order</span></div>
        <div><strong>Order updates</strong><span>Follow purchases in one place</span></div>
        <div><strong>Secure checkout</strong><span>Prices confirmed before payment</span></div>
      </section>

      <section className="departmentSection" aria-labelledby="departments-title">
        <div className="retailSectionHeading">
          <div><p className="eyebrow">Explore CartNest</p><h2 id="departments-title">Shop by department</h2></div>
          <Link href="/marketplace">View everything <span aria-hidden="true">→</span></Link>
        </div>
        <div className="departmentGrid">
          {departments.map((department) => (
            <Link className={`departmentCard departmentCard--${department.tone}`} href={`/marketplace?q=${department.query}`} key={department.name}>
              <span className="departmentNumber" aria-hidden="true">{department.symbol}</span>
              <strong>{department.name}</strong>
              <span>Explore <i aria-hidden="true">→</i></span>
            </Link>
          ))}
        </div>
      </section>

      <HomeDiscovery />

      <section className="sellerCampaign" aria-labelledby="seller-campaign-title">
        <p className="eyebrow">Built for ambitious sellers</p>
        <h2 id="seller-campaign-title">Turn your products into a storefront people remember.</h2>
        <p>Publish your catalogue, manage inventory and fulfil customer orders from one workspace.</p>
        <Link className="campaignButton" href="/vendor">Start selling on CartNest <span aria-hidden="true">→</span></Link>
      </section>
    </main>
  );
}
