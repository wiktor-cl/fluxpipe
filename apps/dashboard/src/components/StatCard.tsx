interface StatCardProps {
  label: string;
  value: number | string;
  tone?: "default" | "warning" | "danger" | "success";
}

const TONE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "border-slate-800 bg-slate-900",
  warning: "border-amber-800 bg-amber-950/40",
  danger: "border-red-800 bg-red-950/40",
  success: "border-emerald-800 bg-emerald-950/40",
};

export function StatCard({ label, value, tone = "default" }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-4 ${TONE_CLASSES[tone]}`}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
