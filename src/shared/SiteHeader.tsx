// Shared top nav across the three entries (demo / docs / admin) so visitors can
// hop between them. Kept dependency-free so each entry can drop it in.

const LINKS = [
  { href: "/", key: "demo", label: "데모" },
  { href: "/docs.html", key: "docs", label: "SDK 문서" },
  { href: "/inbox.html", key: "inbox", label: "받은함" },
  { href: "/admin.html", key: "admin", label: "운영 콘솔" },
] as const;

export function SiteHeader({ current }: { current: "demo" | "docs" | "inbox" | "admin" }) {
  return (
    <header className="site-header">
      <a className="site-header__brand" href="/" aria-label="carrot-chat 홈">
        <span className="site-header__logo" aria-hidden="true">🥕</span>
        carrot<span className="site-header__dot">·</span>chat
      </a>
      <nav className="site-header__nav" aria-label="페이지 이동">
        {LINKS.map((l) => (
          <a
            key={l.key}
            href={l.href}
            className={current === l.key ? "is-active" : ""}
            aria-current={current === l.key ? "page" : undefined}
          >
            {l.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
