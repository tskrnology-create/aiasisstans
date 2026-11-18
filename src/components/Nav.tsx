"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Profil" },
  { href: "/uret", label: "İçerik üret" },
  { href: "/gorsel", label: "Görsel" },
  { href: "/takvim", label: "Takvim" },
  { href: "/kutuphane", label: "Kütüphane" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-neutral-200 dark:border-neutral-800">
      <ul className="mx-auto flex w-full max-w-2xl gap-5 px-5 py-3 text-sm">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "font-semibold underline underline-offset-8"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                }
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
