import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { useI18n } from "../../i18n";
import { emitDebtSaved, emitTransactionSaved } from "../../lib/appEvents";
import {
  allocateReimbursementReceipt,
  getReimbursementReceipts,
  type ReimbursementReceiptDetail,
} from "../../lib/reimbursementReceipts";
import { getWallets, type WalletWithBalance } from "../../lib/wallets";
import { toNumber } from "../../lib/money";

export function ReimbursementReceiptsPanel({
  personalSpaceId,
  eventIds,
  pendingOnly = false,
}: {
  personalSpaceId: string;
  eventIds?: string[];
  pendingOnly?: boolean;
}) {
  const { t, formatCurrency, formatDate } = useI18n();
  const [receipts, setReceipts] = useState<ReimbursementReceiptDetail[]>([]);
  const [loadedSpaceId, setLoadedSpaceId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReimbursementReceiptDetail | null>(null);
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [walletId, setWalletId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const handledDeepLink = useRef<string | null>(null);

  const reload = useCallback(async () => {
    setReceipts(await getReimbursementReceipts(personalSpaceId));
    setLoadedSpaceId(personalSpaceId);
  }, [personalSpaceId]);

  useEffect(() => {
    let active = true;
    setReceipts([]);
    setLoadedSpaceId(null);
    void getReimbursementReceipts(personalSpaceId).then((rows) => {
      if (active) {
        setReceipts(rows);
        setLoadedSpaceId(personalSpaceId);
      }
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : t("common.errorOccurred"));
    });
    return () => { active = false; };
  }, [personalSpaceId, t]);

  useEffect(() => {
    let active = true;
    void getWallets(personalSpaceId).then((result) => {
      if (active && !result.error) setWallets(result.data ?? []);
    });
    return () => { active = false; };
  }, [personalSpaceId]);

  const visible = useMemo(() => loadedSpaceId === personalSpaceId ? receipts.filter((receipt) =>
    (!eventIds || eventIds.includes(receipt.eventId)) &&
    (!pendingOnly || !receipt.allocated_at)
  ) : [], [receipts, eventIds, pendingOnly, personalSpaceId, loadedSpaceId]);

  const openAllocation = async (receipt: ReimbursementReceiptDetail) => {
    setSelected(receipt);
    setWalletId("");
    setRequestId(crypto.randomUUID());
    setError(null);
    try {
      const result = await getWallets(personalSpaceId);
      if (result.error) throw result.error;
      setWallets((result.data ?? []).filter((wallet) => !wallet.is_archived));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.errorOccurred"));
    }
  };

  useEffect(() => {
    const settlementId = new URLSearchParams(window.location.search).get("settlement_id");
    if (!settlementId || handledDeepLink.current === settlementId) return;
    const receipt = visible.find((row) => row.settlement_id === settlementId && !row.allocated_at);
    if (!receipt) return;
    handledDeepLink.current = settlementId;
    void openAllocation(receipt);
  }, [visible]);

  const confirm = async () => {
    if (!selected || !walletId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await allocateReimbursementReceipt({
        settlementId: selected.settlement_id,
        destinationWalletId: walletId,
        clientRequestId: requestId,
      });
      await reload();
      setSelected(null);
      emitDebtSaved();
      emitTransactionSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.errorOccurred"));
    } finally {
      setSaving(false);
    }
  };

  if (!visible.length && !error) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={t("reimbursement.receiptsTitle")}>
      <h2 className="text-sm font-extrabold text-slate-900">{t("reimbursement.receiptsTitle")}</h2>
      {error && !selected && <p role="alert" className="mt-2 text-sm text-kash-expense">{error}</p>}
      <div className="mt-3 space-y-3">
        {visible.map((receipt) => {
          const walletName = receipt.destination_wallet_id
            ? wallets.find((wallet) => wallet.id === receipt.destination_wallet_id)?.name
            : null;
          return (
            <div key={receipt.settlement_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
              <div>
                <p className="text-sm font-bold text-slate-900">{receipt.managedSpaceName} · {formatCurrency(toNumber(receipt.amount), "IDR")}</p>
                <p className="mt-0.5 text-xs text-slate-600">{formatDate(receipt.payment_date)} · {receipt.settlementSource === "external_direct" ? t("reimbursement.externalDirect") : t("reimbursement.managedWallet")}</p>
                <p className="mt-1 text-xs font-semibold text-slate-700">
                  {t("reimbursable.reimbursed")} · {" "}
                  {receipt.allocated_at
                    ? `${t("reimbursement.allocated")}${walletName ? ` · ${walletName}` : ""}`
                    : t("reimbursement.allocationPending")}
                </p>
              </div>
              {!receipt.allocated_at && (
                <Button type="button" onClick={() => void openAllocation(receipt)}>
                  {t("reimbursement.assignWallet")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {selected && (
        <Modal isOpen onClose={() => setSelected(null)} title={t("reimbursement.whereReceived")} maxWidth="sm">
          <div className="space-y-4">
            <p className="text-sm text-slate-700">{selected.managedSpaceName} · {formatCurrency(toNumber(selected.amount), "IDR")}</p>
            <SelectField
              id="reimbursement-destination-wallet"
              label={t("reimbursement.receivedInto")}
              value={walletId}
              onChange={(event) => setWalletId(event.target.value)}
            >
              <option value="">{t("wallets.selectWallet")}</option>
              {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
            </SelectField>
            {wallets.length === 0 && !error && <p className="text-xs text-slate-600">{t("reimbursement.noWallets")}</p>}
            {error && <p role="alert" className="text-sm text-kash-expense">{error}</p>}
            <Button type="button" disabled={!walletId || saving} onClick={() => void confirm()}>
              {t("reimbursement.confirmWallet")}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
