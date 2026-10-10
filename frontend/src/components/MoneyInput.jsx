import { Input } from "@/components/ui/input";
import { rp } from "@/lib/api";

export const MoneyInput = ({ value, onChange, testid, disabled, placeholder = "0", allowEmpty }) => {
  const show = value === null || value === undefined || value === "" ? "" : rp(value);
  const handle = (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) return onChange(allowEmpty ? null : 0);
    onChange(Number(digits));
  };
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">Rp</span>
      <Input
        data-testid={testid}
        inputMode="numeric"
        className="pl-9 text-right font-mono tabular-nums"
        value={show}
        onChange={handle}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
};
