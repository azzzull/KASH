import { UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createSharedSavingsGuestMember } from "../../lib/sharedSavings";
import { useI18n } from "../../i18n";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";

export function AddGuestMemberModal({ isOpen, spaceId, onClose, onCreated }: { isOpen: boolean; spaceId: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n(); const [name, setName] = useState(""); const [note, setNote] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return setError(t("common.required")); setSaving(true); setError(null); try { await createSharedSavingsGuestMember({ spaceId, name: name.trim(), note: note.trim() || undefined }); onCreated(); onClose(); } catch (err: any) { setError(err.message || t("common.error")); } finally { setSaving(false); } };
  return <Modal isOpen={isOpen} onClose={onClose} maxWidth="md" title={<div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-kash-selected text-kash-emeraldDark"><UserPlus size={20}/></span><h2 className="text-base font-extrabold">{t("shared.addGuest")}</h2></div>}><form onSubmit={submit} className="space-y-4">{error && <div className="rounded-xl border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">{error}</div>}<FormField id="guest-name" label={t("shared.guestName")} required autoFocus value={name} onChange={(e) => setName(e.target.value)}/><FormField id="guest-note" label={t("shared.noteOptional")} value={note} onChange={(e) => setNote(e.target.value)}/><div className="flex justify-end gap-3 border-t border-slate-100 pt-3"><Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={saving}>{saving ? t("shared.saving") : t("common.add")}</Button></div></form></Modal>;
}
