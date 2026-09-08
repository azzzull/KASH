import { Link2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { requestSharedSavingsGuestAccountLink } from "../../lib/sharedSavings";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";
import { useI18n } from "../../i18n";

export function LinkGuestAccountModal({ isOpen, participantId, memberName, onClose, onRequested }: { isOpen: boolean; participantId: string; memberName: string; onClose: () => void; onRequested: () => void }) {
 const { t } = useI18n(); const [email,setEmail]=useState(""); const [saving,setSaving]=useState(false); const [error,setError]=useState<string|null>(null);
 const submit=async(e:FormEvent)=>{e.preventDefault(); if(!email.includes("@")) return setError(t("auth.invalidEmail")); setSaving(true); setError(null); try { await requestSharedSavingsGuestAccountLink(participantId,email); onRequested(); onClose(); } catch(err:any){setError(err.message||t("common.error"));} finally{setSaving(false);}};
 return <Modal isOpen={isOpen} onClose={onClose} maxWidth="md" title={<div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-kash-selected text-kash-emeraldDark"><Link2 size={20}/></span><h2 className="text-base font-extrabold">{t("shared.linkAccount")}</h2></div>}><form onSubmit={submit} className="space-y-4"><p className="text-sm text-slate-600">{t("shared.linkAccountHelp",{name:memberName})}</p>{error&&<div className="rounded-xl border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">{error}</div>}<FormField id="link-email" type="email" label={t("shared.kashAccountEmail")} value={email} onChange={e=>setEmail(e.target.value)} required/><div className="flex justify-end gap-3 border-t border-slate-100 pt-3"><Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={saving}>{saving?t("shared.saving"):t("shared.sendLinkRequest")}</Button></div></form></Modal>;
}
