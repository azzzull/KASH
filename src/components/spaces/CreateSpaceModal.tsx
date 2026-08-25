import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveSpace } from "../../context/ActiveSpaceContext";
import { useI18n } from "../../i18n";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";

type CreateSpaceModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function CreateSpaceModal({ isOpen, onClose }: CreateSpaceModalProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { createManagedSpace } = useActiveSpace();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("spaces.spaceName") + " " + t("common.required").toLowerCase());
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createManagedSpace(trimmed);
      setName("");
      onClose();
      navigate("/dashboard");
    } catch (err: any) {
      setError(err?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setName("");
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
          required
        >
          <input
            id="space-name-input"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder={t("spaces.spaceNamePlaceholder")}
            maxLength={50}
            disabled={loading}
            autoFocus
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-kash-emerald/15 disabled:opacity-50"
          />
        </FormField>

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
