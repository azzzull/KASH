import { ArrowLeft, Archive, Edit3, Loader2, SlidersHorizontal, Trash2, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { FormField } from "../components/ui/FormField";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { ToggleField } from "../components/ui/ToggleField";
import { appEvents, emitTransactionSaved } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import { formatCurrency, formatDatabaseMoneyDigits, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../lib/money";
import { createAdjustment } from "../lib/transactions";
import {
  getWalletIcon,
  getWalletTypeOption,
  walletColors,
  walletIconOptions,
  walletTypeOptions,
} from "../lib/walletMeta";
import {
  archiveWallet,
  deleteWallet,
  getWalletById,
  getWalletLinkedGoalCount,
  getWalletTransactionCount,
  updateWallet,
  type WalletWithBalance,
} from "../lib/wallets";
import type { WalletType } from "../types/domain";

type WalletEditState = {
  name: string;
  walletType: WalletType;
  institutionName: string;
  initialBalance: string;
  currency: string;
  includeInNetWorth: boolean;
  icon: string;
  color: string;
};

function toEditState(wallet: WalletWithBalance): WalletEditState {
  return {
    name: wallet.name,
    walletType: wallet.wallet_type,
    institutionName: wallet.institution_name ?? "",
    initialBalance: formatDatabaseMoneyDigits(wallet.initial_balance),
    currency: wallet.currency,
    includeInNetWorth: wallet.include_in_net_worth,
    icon: wallet.icon ?? "wallet",
    color: wallet.color ?? "#10B981",
  };
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-normal text-slate-600">{label}</p>
      <p className="mt-2 text-lg font-extrabold text-slate-900">{value}</p>
    </article>
  );
}

function EditWalletModal({
  canEditInitialBalance,
  onClose,
  onSaved,
  wallet,
}: {
  canEditInitialBalance: boolean;
  onClose: () => void;
  onSaved: () => void;
  wallet: WalletWithBalance;
}) {
  const [form, setForm] = useState<WalletEditState>(toEditState(wallet));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedType = getWalletTypeOption(form.walletType);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const institutionName = selectedType.needsInstitution ? form.institutionName.trim() : "";
    const initialBalance = parseMoneyInputDigits(form.initialBalance);

    if (!name) {
      setError("Wallet name is required.");
      return;
    }

    if (selectedType.needsInstitution && !institutionName) {
      setError("Institution is required for this wallet type.");
      return;
    }

    if (canEditInitialBalance && !initialBalance) {
      setError("Initial balance is required. Enter 0 if this wallet is empty.");
      return;
    }

    setSaving(true);
    setError(null);
    const { error: updateError } = await updateWallet(wallet.id, {
      name,
      walletType: form.walletType,
      institutionName: selectedType.needsInstitution ? institutionName : null,
      initialBalance: canEditInitialBalance ? initialBalance : undefined,
      currency: form.currency,
      includeInNetWorth: form.includeInNetWorth,
      icon: form.icon,
      color: form.color,
    });

    if (updateError) {
      setError("Couldn't update this wallet. Please check the details and try again.");
      setSaving(false);
      return;
    }

    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close edit wallet" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Edit Wallet</h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">Balance changes should come from the ledger once transactions exist.</p>
          </div>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>
        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <SelectField
            disabled
            id="edit-wallet-type"
            label="Wallet Type"
            onChange={(event) => setForm((current) => ({ ...current, walletType: event.target.value as WalletType }))}
            value={form.walletType}
          >
            {walletTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <FormField id="edit-wallet-name" label="Wallet Name" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
          {selectedType.needsInstitution ? (
            <FormField
              id="edit-institution-name"
              label="Institution"
              onChange={(event) => setForm((current) => ({ ...current, institutionName: event.target.value }))}
              value={form.institutionName}
            />
          ) : null}
          <FormField
            disabled={!canEditInitialBalance}
            hint={
              canEditInitialBalance
                ? "Editable while this wallet has no completed financial history."
                : "Locked because this wallet already has completed financial history."
            }
            id="edit-initial-balance"
            inputMode="numeric"
            label="Initial Balance"
            onChange={(event) => setForm((current) => ({ ...current, initialBalance: formatMoneyDigits(event.target.value) }))}
            value={form.initialBalance}
          />
          <SelectField disabled id="edit-currency" label="Currency" onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} value={form.currency}>
            <option value="IDR">IDR - Indonesian Rupiah</option>
          </SelectField>
          <SelectField id="edit-wallet-icon" label="Icon" onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} value={form.icon}>
            {walletIconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <fieldset>
            <legend className="text-sm font-bold text-slate-900">Color Accent</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {walletColors.map((color) => (
                <button
                  aria-label={`Use ${color}`}
                  className={`h-9 w-9 rounded-full border-2 ${form.color === color ? "border-slate-900" : "border-white"} shadow-sm ring-1 ring-slate-200`}
                  key={color}
                  onClick={() => setForm((current) => ({ ...current, color }))}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>
          </fieldset>
          <ToggleField
            checked={form.includeInNetWorth}
            description="Included wallets count toward Total Assets."
            id="edit-include-net-worth"
            label="Include in Net Worth"
            onChange={(event) => setForm((current) => ({ ...current, includeInNetWorth: event.target.checked }))}
          />
          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            Save Changes
          </Button>
        </form>
      </section>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:p-6">
      <div className="h-8 w-32 rounded-lg bg-slate-100" />
      <div className="h-48 rounded-lg border border-slate-200 bg-white p-5">
        <div className="h-4 w-1/3 rounded-full bg-slate-100" />
        <div className="mt-8 h-8 w-2/3 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}

function currentLocalDateTimeValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function AdjustmentModal({
  currentBalance,
  onClose,
  onSaved,
  wallet,
}: {
  currentBalance: string | number;
  onClose: () => void;
  onSaved: () => void;
  wallet: WalletWithBalance;
}) {
  const [actualBalance, setActualBalance] = useState("");
  const [reason, setReason] = useState("");
  const [transactionDate, setTransactionDate] = useState(currentLocalDateTimeValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actualDigits = parseMoneyInputDigits(actualBalance);
  const currentAmount = toNumber(currentBalance);
  const actualAmount = toNumber(actualDigits);
  const adjustmentAmount = actualDigits ? actualAmount - currentAmount : 0;
  const signedAdjustment = adjustmentAmount < 0 ? `-${Math.abs(adjustmentAmount)}` : String(adjustmentAmount);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    if (!actualDigits) {
      setError("Actual balance is required.");
      return;
    }

    if (adjustmentAmount === 0) {
      setError("Adjustment must not be zero.");
      return;
    }

    if (!reason.trim()) {
      setError("Adjustment reason is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: adjustmentError } = await createAdjustment({
        amount: signedAdjustment,
        reason: reason.trim(),
        transactionDate,
        walletId: wallet.id,
      });

      if (adjustmentError) {
        console.error("Failed to create adjustment", adjustmentError);
        setError("Couldn't save this adjustment. Please check the details and try again.");
        setSaving(false);
        return;
      }

      emitTransactionSaved();
      onSaved();
    } catch (adjustmentError) {
      console.error("Failed to create adjustment", adjustmentError);
      setError("Couldn't save this adjustment. Please sign in and try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close adjustment form" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Adjust Balance</h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">Reconcile KASH with the real balance in this wallet.</p>
          </div>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-600">Current KASH Balance</p>
            <p className="mt-2 text-xl font-extrabold text-slate-900">{formatCurrency(currentBalance, wallet.currency)}</p>
          </div>
          <FormField
            id="actual-balance"
            inputMode="numeric"
            label="Actual Balance"
            onChange={(event) => setActualBalance(formatMoneyDigits(event.target.value))}
            placeholder="600.000"
            value={actualBalance}
          />
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-600">Adjustment</p>
            <p className={`mt-2 text-xl font-extrabold ${adjustmentAmount < 0 ? "text-kash-expense" : "text-kash-income"}`}>
              {adjustmentAmount === 0 ? formatCurrency(0, wallet.currency) : `${adjustmentAmount > 0 ? "+" : "-"}${formatCurrency(Math.abs(adjustmentAmount), wallet.currency)}`}
            </p>
          </div>
          <FormField id="adjustment-date" label="Date" onChange={(event) => setTransactionDate(event.target.value)} type="datetime-local" value={transactionDate} />
          <FormField id="adjustment-reason" label="Reason" onChange={(event) => setReason(event.target.value)} placeholder="Cash count correction" value={reason} />
          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            Save Adjustment
          </Button>
        </form>
      </section>
    </div>
  );
}

export function WalletDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<WalletWithBalance | null>(null);
  const [linkedGoalCount, setLinkedGoalCount] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const [{ data, error: walletError }, { count, error: countError }, { count: goalCount, error: goalCountError }] = await Promise.all([
      getWalletById(id),
      getWalletTransactionCount(id),
      getWalletLinkedGoalCount(id),
    ]);

    if (walletError || countError || goalCountError || !data) {
      setError("Couldn't load this wallet. It may not exist or you may not have access.");
      setLoading(false);
      return;
    }

    setWallet(data);
    setTransactionCount(count);
    setLinkedGoalCount(goalCount);
    setLoading(false);
  };

  useEffect(() => {
    void loadWallet();
  }, [id]);

  useAppEvent(appEvents.transactionSaved, () => void loadWallet());
  useAppEvent(appEvents.goalSaved, () => void loadWallet());

  const handleDeleteWallet = async () => {
    if (!wallet) return;

    if (linkedGoalCount > 0) {
      setError("This wallet is linked to a goal. Archive or edit the goal first before deleting this wallet.");
      setShowDelete(false);
      return;
    }

    setDeleting(true);
    const result =
      transactionCount === 0
        ? await deleteWallet(wallet.id)
        : await archiveWallet(wallet.id);

    if (result.error) {
      setError(transactionCount === 0 ? "Couldn't delete this wallet. Please try again." : "Couldn't archive this wallet. Please try again.");
      setDeleting(false);
      setShowDelete(false);
      return;
    }

    emitTransactionSaved();
    navigate("/wallets", { replace: true });
  };

  if (loading) return <DetailSkeleton />;

  if (error || !wallet) {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 md:p-6">
        <Link className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-kash-emerald" to="/wallets">
          <ArrowLeft aria-hidden="true" size={17} />
          Wallets
        </Link>
        <section className="rounded-lg border border-kash-expense/30 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold text-slate-900">Something went wrong.</h2>
          <p className="mt-2 text-sm font-semibold text-slate-700">{error}</p>
          <Button className="mt-4" onClick={() => void loadWallet()}>
            Retry
          </Button>
        </section>
      </div>
    );
  }

  const typeOption = getWalletTypeOption(wallet.wallet_type);
  const Icon = getWalletIcon(wallet.icon, wallet.wallet_type);
  const currentBalance = wallet.balance?.current_balance ?? wallet.initial_balance;
  const availableBalance = wallet.balance?.available_balance ?? currentBalance;
  const canEditInitialBalance = transactionCount === 0;
  const canHardDelete = transactionCount === 0 && linkedGoalCount === 0;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:p-6">
      <Link className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-kash-emerald" to="/wallets">
        <ArrowLeft aria-hidden="true" size={17} />
        Wallets
      </Link>

      <PageHeader
        eyebrow={typeOption.label}
        icon={Icon}
        title={wallet.name}
        description={wallet.institution_name ?? "Wallet details and balance controls."}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowEdit(true)} variant="secondary">
              <Edit3 aria-hidden="true" size={17} />
              Edit
            </Button>
            <Button onClick={() => setShowAdjustment(true)} variant="secondary">
              <SlidersHorizontal aria-hidden="true" size={17} />
              Adjust Balance
            </Button>
            <Button disabled={deleting} onClick={() => setShowDelete(true)} variant="secondary">
              <Trash2 aria-hidden="true" size={17} />
              Delete
            </Button>
          </div>
        }
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <DetailMetric label="Current Balance" value={formatCurrency(currentBalance, wallet.currency)} />
          <DetailMetric label="Available Balance" value={formatCurrency(availableBalance, wallet.currency)} />
          <DetailMetric label="Initial Balance" value={formatCurrency(wallet.initial_balance, wallet.currency)} />
          <DetailMetric label="Wallet Type" value={typeOption.label} />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <DetailMetric label="Currency" value={wallet.currency} />
        <DetailMetric label="Include in Net Worth" value={wallet.include_in_net_worth ? "Yes" : "No"} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <WalletCards aria-hidden="true" className="text-slate-600" size={18} />
          <h3 className="text-base font-extrabold text-slate-900">Recent Transactions</h3>
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <h4 className="text-base font-extrabold text-slate-900">No transactions yet.</h4>
          <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-700">
            Transaction history will appear here after the transaction system is implemented.
          </p>
        </div>
      </section>

      {showEdit ? (
        <EditWalletModal
          canEditInitialBalance={canEditInitialBalance}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            void loadWallet();
          }}
          wallet={wallet}
        />
      ) : null}
      {showAdjustment ? (
        <AdjustmentModal
          currentBalance={currentBalance}
          onClose={() => setShowAdjustment(false)}
          onSaved={() => {
            setShowAdjustment(false);
            void loadWallet();
          }}
          wallet={wallet}
        />
      ) : null}
      {showDelete ? (
        <ConfirmationDialog
          confirmLabel={canHardDelete ? "Delete Wallet" : "Archive Wallet"}
          description={
            linkedGoalCount > 0
              ? "This wallet is linked to a goal, so it cannot be deleted from here."
              : canHardDelete
                ? "This wallet has no transaction history, so it can be permanently deleted."
                : "This wallet has financial history, so KASH will hide it from active wallet lists instead of deleting the records."
          }
          disabled={linkedGoalCount > 0}
          icon={canHardDelete ? Trash2 : Archive}
          isLoading={deleting}
          itemLabel={wallet.name}
          onCancel={() => setShowDelete(false)}
          onConfirm={() => void handleDeleteWallet()}
          title={canHardDelete ? "Delete this wallet?" : "Archive this wallet?"}
          tone={canHardDelete ? "danger" : "warning"}
        />
      ) : null}
    </div>
  );
}
