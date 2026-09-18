"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "./session-provider";

function Icon({
  name,
}: Readonly<{ name: "search" | "heart" | "cart" | "user" }>) {
  const paths = {
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    heart: (
      <path d="M20 8.7c0 5.2-8 10.4-8 10.4S4 13.9 4 8.7A4.3 4.3 0 0 1 12 6a4.3 4.3 0 0 1 8 2.7Z" />
    ),
    cart: (
      <>
        <path d="M3.5 4.5h2l1.3 9.1a1.7 1.7 0 0 0 1.7 1.4h7.9a1.7 1.7 0 0 0 1.6-1.2L20 8H7" />
        <circle cx="9.3" cy="18.3" r="1.1" />
        <circle cx="16.8" cy="18.3" r="1.1" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.2 20a6.8 6.8 0 0 1 13.6 0" />
      </>
    ),
  } as const;

  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, status, logout, reloadSession } = useSession();
  const marketplaceActive = pathname.startsWith("/marketplace") || pathname.startsWith("/products/");
  const cartActive = pathname.startsWith("/cart") || pathname.startsWith("/checkout");
  const admin = Boolean(session && ["ADMIN", "SUPER_ADMIN"].includes(session.user.platformRole));
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(pathname.startsWith("/marketplace") ? params.get("q") ?? "" : "");
  }, [pathname]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    router.push(query ? `/marketplace?q=${encodeURIComponent(query)}` : "/marketplace");
  }

  const accountHref = status === "authenticated" ? "/account" : "/login";
  const wishlistHref = status === "authenticated" ? "/wishlist" : "/login";

  return (
    <header className="siteHeader">
      <div className="headerInner">
        <div className="headerMain">
          <Link className="brand" href="/" aria-label="CartNest home">
            <span className="brandMark" aria-hidden="true">C</span>
            <span>CartNest</span>
          </Link>

          <form className="headerSearch" role="search" onSubmit={submitSearch}>
            <span className="headerSearchIcon">
              <Icon name="search" />
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search products, brands and stores"
              placeholder="Search products, brands or stores…"
              maxLength={200}
            />
            <button className="headerSearchSubmit" type="submit" aria-label="Search">
              <Icon name="search" />
            </button>
          </form>
        </div>

        <div className="headerActions">
          <Link
            className="iconButton"
            href={wishlistHref}
            aria-current={pathname.startsWith("/wishlist") ? "page" : undefined}
            aria-label="Saved items"
            title="Saved items"
          >
            <Icon name="heart" />
          </Link>
          <Link
            className="iconButton"
            href="/cart"
            aria-current={cartActive ? "page" : undefined}
            aria-label="Cart"
            title="Cart"
          >
            <Icon name="cart" />
          </Link>
          <Link
            className="iconButton accountButton"
            href={accountHref}
            aria-current={pathname.startsWith("/account") ? "page" : undefined}
            aria-label={status === "authenticated" ? "Account" : "Sign in"}
            title={status === "authenticated" ? "Account" : "Sign in"}
          >
            <Icon name="user" />
          </Link>
          {status === "authenticated" ? (
            <button className="navButton" type="button" onClick={() => void logout()} aria-label="Sign out">
              Sign out
            </button>
          ) : status === "loading" ? (
            <span className="navStatus" aria-live="polite">Checking session…</span>
          ) : status === "error" ? (
            <button className="navButton navButtonAlert" type="button" onClick={() => void reloadSession()}>
              Retry
            </button>
          ) : (
            <Link className="headerCta" href="/register">Create account</Link>
          )}
        </div>
      </div>

      <div className="categoryNavWrap">
        <nav className="categoryNav" aria-label="Marketplace navigation">
          <Link className="categoryLink" href="/marketplace" aria-current={marketplaceActive ? "page" : undefined}>
            Categories
          </Link>
          <Link className="categoryLink" href="/marketplace">
            Deals
          </Link>
          <Link className="categoryLink" href="/marketplace">
            Stores
          </Link>
          <Link className="categoryLink" href="/marketplace?sort=NEWEST">
            New arrivals
          </Link>
          <Link className="categoryLink categoryLinkAccent" href="/vendor">
            Sell on CartNest
          </Link>
          {admin ? (
            <Link className="categoryLink" href="/admin" aria-current={pathname.startsWith("/admin") ? "page" : undefined}>
              Admin
            </Link>
          ) : null}
          {session?.mfa.required && !session.mfa.satisfied ? (
            <Link className="categoryLink categoryLinkAccent" href="/mfa">Verify MFA</Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
