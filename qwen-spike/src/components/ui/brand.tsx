import Link from "next/link";

export function Brand(): React.ReactElement {
  return <Link href="/" className="brand" aria-label="Tokyo Collectible Finder 首页"><span className="brand-mark">C</span><span>COLLECTIBLE<br /><b>TOKYO</b></span></Link>;
}

export function Shell({ children, className }: { children: React.ReactNode; className?: string }): React.ReactElement {
  return <main className={className}><header className="site-header"><Brand /><span className="header-note">AI identification · Japan asking prices · Tokyo areas</span></header>{children}<footer>Online asking-price reference only · Always confirm store details before visiting.</footer></main>;
}
