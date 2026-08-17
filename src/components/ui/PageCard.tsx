import { ReactNode } from "react";

type PageCardProps = {
  children: ReactNode;
  className?: string;
};

export function PageCard({ children, className = "" }: PageCardProps) {
  return (
    <section className={`rounded-lg border border-kash-emerald/10 bg-white/95 p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}
