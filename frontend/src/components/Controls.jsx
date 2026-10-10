import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";

export const RG = ({ value, onChange, options, testid, disabled }) => (
  <RadioGroup value={value} onValueChange={onChange} className="flex flex-wrap gap-x-5 gap-y-2" disabled={disabled} data-testid={testid}>
    {options.map(([v, l]) => (
      <label key={v} className="flex cursor-pointer items-center gap-2 text-sm">
        <RadioGroupItem value={v} data-testid={`${testid}-${v}`} className="border-[#155e46] text-[#155e46]" />
        {l}
      </label>
    ))}
  </RadioGroup>
);

export const CuSelect = ({ value, onChange, testid = "cu-select", allowAll, disabled }) => {
  const { org } = useAuth();
  return (
    <Select value={value || (allowAll ? "all" : undefined)} onValueChange={(v) => onChange(v === "all" ? "" : v)} disabled={disabled}>
      <SelectTrigger data-testid={testid} className="bg-white"><SelectValue placeholder="Pilih Credit Union" /></SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value="all">Semua Credit Union</SelectItem>}
        {org.cus.map((c) => (
          <SelectItem key={c.id} value={c.id}>{c.kode} — {c.nama}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export const SimpleSelect = ({ value, onChange, options, testid, placeholder = "Semua" }) => (
  <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
    <SelectTrigger data-testid={testid} className="bg-white"><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent>
      <SelectItem value="all">{placeholder}</SelectItem>
      {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
    </SelectContent>
  </Select>
);

export const SortTh = ({ k, label, sort, setSort, className = "" }) => {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`cursor-pointer select-none px-3 py-2.5 text-left ${className}`} onClick={() => setSort({ key: k, dir: active && sort.dir === "asc" ? "desc" : "asc" })} data-testid={`sort-${k}`}>
      <span className="inline-flex items-center gap-1">{label}<Icon className="h-3 w-3 opacity-60" /></span>
    </th>
  );
};

export const Confirm = ({ open, onOpenChange, title, desc, onConfirm, confirmText = "Hapus", danger = true }) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent data-testid="confirm-dialog">
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{desc}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-testid="confirm-cancel">Batal</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} className={danger ? "bg-red-600 hover:bg-red-700" : "bg-[#155e46] hover:bg-[#0d3b2e]"} data-testid="confirm-ok">{confirmText}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
