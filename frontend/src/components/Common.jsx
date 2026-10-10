const STYLES = {
  Disetujui: "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Disetujui Sebagian": "bg-amber-100 text-amber-800 border-amber-300",
  Ditunda: "bg-orange-100 text-orange-800 border-orange-300",
  "Tidak Disetujui": "bg-red-100 text-red-800 border-red-300",
  "Antrian Analisis": "bg-stone-100 text-stone-700 border-stone-300",
  "Sudah Dianalisis": "bg-sky-50 text-sky-800 border-sky-200",
  Dicairkan: "bg-[#155e46] text-white border-[#155e46]",
};

export const StatusBadge = ({ value, testid }) =>
  value ? (
    <span data-testid={testid} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STYLES[value] || "bg-stone-100 text-stone-700"}`}>
      {value}
    </span>
  ) : (
    <span className="text-muted-foreground">-</span>
  );

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4 fade-up">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#0d3b2e] md:text-3xl" data-testid="page-title">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

export const Field = ({ label, children, className = "" }) => (
  <div className={`space-y-1.5 ${className}`}>
    <label className="text-xs font-semibold uppercase tracking-wide text-[#57534e]">{label}</label>
    {children}
  </div>
);
