import { useState, type FormEvent } from "react";
import { useActiveSpace } from "../../context/ActiveSpaceContext";
import { useI18n } from "../../i18n";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { walletTypeOptions } from "../../lib/walletMeta";
import type { WalletType } from "../../types/domain";

type CreateSpaceModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function CreateSpaceModal({ isOpen, onClose }: CreateSpaceModalProps) {
  const { t } = useI18n();
  const { createManagedSpace } = useActiveSpace();
  const [name, setName] = useState("");
  const [walletName, setWalletName] = useState("");
  const [walletType, setWalletType] = useState<WalletType>("cash");
  const [walletNameEdited, setWalletNameEdited] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!walletNameEdited) {
      setWalletName(val);
    }
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const trimmedWallet = walletName.trim();
    if (!trimmed) {
      setError(t("spaces.spaceName") + " " + t("common.required").toLowerCase());
      return;
    }
    if (!trimmedWallet) {
      setError(t("wallets.name") + " " + t("common.required").toLowerCase());
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createManagedSpace(trimmed, trimmedWallet, walletType);
      setName("");
      setWalletName("");
      setWalletType("cash");
      setWalletNameEdited(false);
      onClose();
    } catch (err: any) {
      setError(err?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setName("");
    setWalletName("");
    setWalletType("cash");
    setWalletNameEdited(false);
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("spaces.createTitle")}
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2 pb-1">
        {error ? (
          <div className="rounded-xl border border-kash-expense/20 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
            {error}
          </div>
        ) : null}

        <FormField
          id="space-name-input"
          label={t("spaces.spaceName")}
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder={t("spaces.spaceNamePlaceholder")}
          maxLength={50}
          disabled={loading}
          autoFocus
          required
          hasError={Boolean(error)}
        />

        <div className="border-t border-slate-100 pt-3 flex flex-col gap-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {t("spaces.initialWallet")}
          </p>

          <FormField
            id="initial-wallet-name"
            label={t("wallets.name")}
            type="text"
            value={walletName}
            onChange={(e) => {
              setWalletName(e.target.value);
              setWalletNameEdited(true);
              if (error) setError(null);
            }}
            placeholder={t("wallets.namePlaceholder")}
            maxLength={50}
            disabled={loading}
            required
            hasError={Boolean(error)}
          />

          <SelectField
            id="initial-wallet-type"
            label={t("wallets.type") || "Tipe Dompet"}
            onChange={(event) => setWalletType(event.target.value as WalletType)}
            value={walletType}
            disabled={loading}
          >
            {walletTypeOptions
              .filter(opt => !["investment", "custom"].includes(opt.value))
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </SelectField>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={loading}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={loading || !name.trim()}
          >
            {loading ? t("common.saving") : t("spaces.createButton")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
