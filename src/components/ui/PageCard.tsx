import { ReactNode } from "react";

type PageCardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
};

export function PageCard({ children, className = "", hover = false }: PageCardProps) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/60 bg-white shadow-card ${
        hover ? "transition-shadow duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-card-hover" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}
