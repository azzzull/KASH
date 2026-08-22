import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  Archive,
  Edit3,
  Layers,
  MoreVertical,
  Plus,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ContextualCreateAction } from "../components/ui/ContextualCreateAction";
import { CategoryIconPicker } from "../components/categories/CategoryIconPicker";
import { QuickCreateEnvelopeModal } from "../components/envelopes/QuickCreateEnvelopeModal";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { FilterTabs } from "../components/ui/FilterTabs";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  getSystemCategories,
  getUserCategories,
  updateCategory,
} from "../lib/categories";
import {
  deleteEnvelope,
  getEnvelopes,
  updateEnvelope,
} from "../lib/envelopes";
import {
  categoryColors,
  getCategoryIcon,
  isAllowedCategoryColor,
} from "../lib/categoryMeta";
import { useI18n } from "../i18n";
import type { Category, CategoryType, Envelope } from "../types/domain";

type CategoryFormState = {
  name: string;
  categoryType: CategoryType;
  icon: string;
  color: string;
};

const defaultFormState: CategoryFormState = {
  name: "",
  categoryType: "expense",
  icon: "utensils",
  color: "#E50914",
};

function CategoryPill({
  category,
  onArchive,
  onDelete,
  onEdit,
}: {
  category: Category;
  onArchive?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const { t } = useI18n();
  const Icon = getCategoryIcon(category.icon);

  return (
    <article className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs transition hover:border-slate-300">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
          style={{ backgroundColor: category.color ?? "#91A3BB" }}
        >
          <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold text-slate-900" title={category.name}>
            {category.name}
          </span>
          <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
            {category.is_system ? (t("categories.system") || "System") : (t("categories.custom") || "Custom")}
          </span>
        </div>
      </div>

      {category.is_system ? (
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
          {t("categories.readOnly") || "Read only"}
        </span>
      ) : (
        <div className="shrink-0">
          {/* Desktop buttons (visible on md and up) */}
          <div className="hidden md:flex items-center gap-1.5">
            <Button onClick={onEdit} variant="secondary" className="min-h-8 px-2.5 py-1 text-xs">
              <Edit3 aria-hidden="true" size={13} />
              {t("common.edit")}
            </Button>
            <Button onClick={onArchive} variant="secondary" className="min-h-8 px-2.5 py-1 text-xs text-slate-600">
              <Archive aria-hidden="true" size={13} />
              {t("common.archive")}
            </Button>
            <IconButton
              icon={Trash2}
              label={t("common.delete")}
              onClick={onDelete}
              className="h-8 w-8 text-slate-500 hover:text-kash-expense hover:bg-red-50"
            />
          </div>

          {/* Mobile 3-dot More Menu */}
          <div className="md:hidden">
            <Menu as="div" className="relative inline-block text-left">
              <MenuButton
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-kash-emerald/50 hover:bg-kash-selected/40 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
                aria-label={`Menu aksi ${category.name}`}
              >
                <MoreVertical size={16} />
              </MenuButton>

              <MenuItems
                transition
                className="absolute right-0 z-30 mt-1 w-44 origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl transition focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75"
              >
                <MenuItem>
                  {({ focus }) => (
                    <button
                      type="button"
                      onClick={onEdit}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                        focus ? "bg-slate-50 text-slate-900" : "text-slate-700"
                      }`}
                    >
                      <Edit3 size={14} />
                      {t("common.edit")}
                    </button>
                  )}
                </MenuItem>
                <MenuItem>
                  {({ focus }) => (
                    <button
                      type="button"
                      onClick={onArchive}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                        focus ? "bg-slate-50 text-slate-900" : "text-slate-700"
                      }`}
                    >
                      <Archive size={14} />
                      {t("common.archive")}
                    </button>
                  )}
                </MenuItem>
                <div className="my-1 border-t border-slate-100" />
                <MenuItem>
                  {({ focus }) => (
                    <button
                      type="button"
                      onClick={onDelete}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                        focus ? "bg-red-50 text-kash-expense" : "text-kash-expense"
                      }`}
                    >
                      <Trash2 size={14} />
                      {t("common.delete")}
                    </button>
                  )}
                </MenuItem>
              </MenuItems>
            </Menu>
          </div>
        </div>
      )}
    </article>
  );
}

function EnvelopePill({
  envelope,
  onArchive,
  onDelete,
  onEdit,
}: {
  envelope: Envelope;
  onArchive?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const { t } = useI18n();
  const Icon = getCategoryIcon(envelope.icon || "layers");

  return (
    <article className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs transition hover:border-kash-emerald hover:bg-kash-selected/30">
      <Link to={`/envelopes/${envelope.id}`} className="flex items-center gap-3.5 min-w-0 flex-1">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-xs transition group-hover:scale-105"
          style={{ backgroundColor: envelope.color ?? "#4F7DF3" }}
        >
          <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-slate-900 group-hover:text-kash-emeraldDark" title={envelope.name}>
            {envelope.name}
          </span>
          <span className="mt-0.5 block truncate text-xs font-medium text-slate-600">
            {envelope.note || (t("categories.specialExpenseEnvelope") || "Amplop Pengeluaran Khusus")}
          </span>
        </div>
      </Link>

      <div className="shrink-0">
        {/* Desktop buttons */}
        <div className="hidden md:flex items-center gap-1.5">
          <Button onClick={onEdit} variant="secondary" className="min-h-8 px-2.5 py-1 text-xs font-bold">
            <Edit3 aria-hidden="true" size={13} />
            {t("common.edit")}
          </Button>
          <Button onClick={onArchive} variant="secondary" className="min-h-8 px-2.5 py-1 text-xs text-slate-600 font-bold">
            <Archive aria-hidden="true" size={13} />
            {t("common.archive")}
          </Button>
          <IconButton
            icon={Trash2}
            label={t("common.delete")}
            onClick={onDelete}
            className="h-8 w-8 text-slate-500 hover:text-kash-expense hover:bg-red-50"
          />
        </div>

        {/* Mobile 3-dot More Menu */}
        <div className="md:hidden">
          <Menu as="div" className="relative inline-block text-left">
            <MenuButton
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-kash-emerald/50 hover:bg-kash-selected/40 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
              aria-label={`Menu aksi ${envelope.name}`}
            >
              <MoreVertical size={16} />
            </MenuButton>

            <MenuItems
              transition
              className="absolute right-0 z-30 mt-1 w-44 origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl transition focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75"
            >
              <MenuItem>
                {({ focus }) => (
                  <button
                    type="button"
                    onClick={onEdit}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                      focus ? "bg-slate-50 text-slate-900" : "text-slate-700"
                    }`}
                  >
                    <Edit3 size={14} />
                    {t("common.edit")}
                  </button>
                )}
              </MenuItem>
              <MenuItem>
                {({ focus }) => (
                  <button
                    type="button"
                    onClick={onArchive}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                      focus ? "bg-slate-50 text-slate-900" : "text-slate-700"
                    }`}
                  >
                    <Archive size={14} />
                    {t("common.archive")}
                  </button>
                )}
              </MenuItem>
              <div className="my-1 border-t border-slate-100" />
              <MenuItem>
                {({ focus }) => (
                  <button
                    type="button"
                    onClick={onDelete}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                      focus ? "bg-red-50 text-kash-expense" : "text-kash-expense"
                    }`}
                  >
                    <Trash2 size={14} />
                    {t("common.delete")}
                  </button>
                )}
              </MenuItem>
            </MenuItems>
          </Menu>
        </div>
      </div>
    </article>
  );
}

function CategoryFormModal({
  category,
  onClose,
  onSaved,
}: {
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<CategoryFormState>(
    category
      ? {
          name: category.name,
          categoryType: category.category_type,
          icon: category.icon ?? "circle",
          color: category.color ?? "#91A3BB",
        }
      : defaultFormState,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(category);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();

    if (!name) {
      setError(t("categories.nameRequired") || "Nama kategori wajib diisi.");
      return;
    }

    setSaving(true);
    setError(null);

    const color = isAllowedCategoryColor(form.color) ? form.color : categoryColors[0];

    const result = isEditing && category
      ? await updateCategory(category, {
          color,
          icon: form.icon,
          name,
        })
      : await createCategory({
          categoryType: form.categoryType,
          color,
          icon: form.icon,
          name,
        });

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    onSaved();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={isEditing ? (t("categories.editCategory") || "Edit Kategori") : (t("categories.newCategory") || "Kategori Baru")}
      description={t("categories.formDesc") || "Atur nama, jenis, warna, dan ikon kategori"}
    >
      <div>
        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          {error ? (
            <p className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
              {error}
            </p>
          ) : null}

          <FormField
            disabled={saving}
            id="category-name"
            label={`${t("categories.nameLabel") || "Nama Kategori"} *`}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={t("categories.namePlaceholder") || "e.g. Kopi & Nongkrong, Langganan Musik"}
            required
            value={form.name}
            autoFocus
          />

          <SelectField
            disabled={saving || isEditing}
            id="category-type"
            label={t("categories.typeLabel") || "Tipe Transaksi"}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                categoryType: event.target.value as CategoryType,
              }))
            }
            value={form.categoryType}
          >
            <option value="expense">{t("common.typeExpense") || "Pengeluaran (Expense)"}</option>
            <option value="income">{t("common.typeIncome") || "Pemasukan (Income)"}</option>
          </SelectField>

          {/* Icon Picker Component */}
          <CategoryIconPicker
            value={form.icon}
            onChange={(iconKey) => setForm((prev) => ({ ...prev, icon: iconKey }))}
            accentColor={form.color}
            label={t("categories.chooseIcon") || "Pilih Ikon Kategori"}
          />

          {/* Color Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">{t("categories.chooseColor") || "Pilih Warna Kategori"}</label>
            <div className="flex flex-wrap gap-2.5">
              {categoryColors.map((color) => {
                const isSelected = form.color.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, color }))}
                    className="flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-110 focus:outline-none ring-offset-2 focus:ring-2 focus:ring-kash-emerald"
                    style={{ backgroundColor: color }}
                    aria-label={`Pilih warna ${color}`}
                  >
                    {isSelected && (
                      <span className="block h-2.5 w-2.5 rounded-full bg-white shadow-xs" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
              {t("common.cancel")}
            </Button>
            <Button disabled={saving || !form.name.trim()} type="submit">
              {saving ? t("common.saving") : isEditing ? t("common.saveChanges") : (t("categories.createButton") || "Buat Kategori")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function CategoryGroup({
  categories,
  title,
}: {
  categories: Category[];
  title: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
      <div className="mt-3 grid gap-2">
        {categories.map((category) => (
          <CategoryPill category={category} key={category.id} />
        ))}
      </div>
    </section>
  );
}

function CategorySkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-4 w-1/3 rounded-full bg-slate-100" />
          <div className="mt-3 h-3 w-2/3 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function CategoriesPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"categories" | "envelopes">("categories");

  // Category state
  const [systemCategories, setSystemCategories] = useState<Category[]>([]);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [archivingCategory, setArchivingCategory] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(false);

  // Envelope state
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [editingEnvelope, setEditingEnvelope] = useState<Envelope | null>(null);
  const [showEnvelopeModal, setShowEnvelopeModal] = useState(false);
  const [archiveEnvelopeTarget, setArchiveEnvelopeTarget] = useState<Envelope | null>(null);
  const [deleteEnvelopeTarget, setDeleteEnvelopeTarget] = useState<Envelope | null>(null);
  const [archivingEnvelope, setArchivingEnvelope] = useState(false);
  const [deletingEnvelope, setDeletingEnvelope] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const [systemResult, userResult, envResult] = await Promise.all([
      getSystemCategories(),
      getUserCategories(),
      getEnvelopes(false),
    ]);

    if (systemResult.error || userResult.error || !systemResult.data || !userResult.data) {
      setError(t("categories.loadFailed") || "Gagal memuat kategori. Silakan coba lagi.");
      setLoading(false);
      return;
    }

    setSystemCategories(systemResult.data);
    setCustomCategories(userResult.data.filter((category) => !category.is_archived));
    setEnvelopes((envResult.data ?? []).filter((e) => !e.is_archived));
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const groupedCategories = useMemo(() => {
    const activeSystem = systemCategories.filter((category) => !category.is_archived);
    return {
      customExpense: customCategories.filter((category) => category.category_type === "expense"),
      customIncome: customCategories.filter((category) => category.category_type === "income"),
      systemExpense: activeSystem.filter((category) => category.category_type === "expense"),
      systemIncome: activeSystem.filter((category) => category.category_type === "income"),
    };
  }, [customCategories, systemCategories]);

  // Handle Category Archive & Delete
  const handleArchiveCategory = async (category: Category) => {
    setArchivingCategory(true);
    try {
      const { error: archiveError } = await archiveCategory(category);
      if (archiveError) {
        setError(t("categories.archiveFailed") || "Gagal mengarsipkan kategori.");
        setArchivingCategory(false);
        setArchiveTarget(null);
        return;
      }
      setArchiveTarget(null);
      await loadData();
    } catch {
      setError(t("categories.systemCannotArchive") || "Kategori sistem tidak dapat diarsipkan.");
    } finally {
      setArchivingCategory(false);
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    setDeletingCategory(true);
    setError(null);
    try {
      await deleteCategory(category);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || (t("categories.deleteFailed") || "Gagal menghapus kategori."));
      setDeleteTarget(null);
    } finally {
      setDeletingCategory(false);
    }
  };

  // Handle Envelope Archive & Delete
  const handleArchiveEnvelope = async (envelope: Envelope) => {
    setArchivingEnvelope(true);
    try {
      const { error: envError } = await updateEnvelope(envelope.id, {
        name: envelope.name,
        color: envelope.color,
        icon: envelope.icon,
        note: envelope.note,
        isArchived: true,
      });
      if (envError) {
        setError(t("categories.archiveEnvFailed") || "Gagal mengarsipkan amplop.");
        setArchivingEnvelope(false);
        setArchiveEnvelopeTarget(null);
        return;
      }
      setArchiveEnvelopeTarget(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || (t("categories.archiveEnvFailed") || "Gagal mengarsipkan amplop."));
    } finally {
      setArchivingEnvelope(false);
    }
  };

  const handleDeleteEnvelope = async (envelope: Envelope) => {
    setDeletingEnvelope(true);
    setError(null);
    try {
      const { success, error: delError } = await deleteEnvelope(envelope.id);
      if (delError || !success) {
        setError(delError?.message || (t("categories.deleteEnvFailed") || "Gagal menghapus amplop."));
        setDeleteEnvelopeTarget(null);
        return;
      }
      setDeleteEnvelopeTarget(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || (t("categories.deleteEnvFailed") || "Gagal menghapus amplop."));
      setDeleteEnvelopeTarget(null);
    } finally {
      setDeletingEnvelope(false);
    }
  };

  const tabOptions = useMemo(() => [
    { label: t("nav.categories") || "Kategori Transaksi", value: "categories" },
    { label: t("nav.envelopes") || "Amplop Pengeluaran", value: "envelopes", count: envelopes.length },
  ], [envelopes.length, t]);

  const createActionRef = useRef<HTMLDivElement>(null);

  return (
    <div className="w-full min-w-0 space-y-4">
      <PageHeader
        eyebrow={t("categories.manageBudget") || "Kelola Anggaran"}
        icon={activeTab === "categories" ? Tags : Layers}
        title={activeTab === "categories" ? (t("nav.categories") || "Kategori Transaksi") : (t("nav.envelopes") || "Amplop Pengeluaran")}
        description={
          activeTab === "categories"
            ? (t("categories.categoriesDesc") || "Kelola kategori pengeluaran dan pemasukan dengan ikon dan warna kustom.")
            : (t("categories.envelopesDesc") || "Kelola amplop alokasi tujuan khusus (seperti Date, Liburan, Proyek Rumah).")
        }
        actions={
          <div ref={createActionRef} className="hidden sm:block">
            {activeTab === "categories" ? (
              <Button onClick={() => setShowCategoryForm(true)} className="w-full sm:w-auto">
                <Plus aria-hidden="true" size={18} />
                {t("categories.newCategory") || "Kategori Baru"}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setEditingEnvelope(null);
                  setShowEnvelopeModal(true);
                }}
                className="w-full sm:w-auto"
              >
                <Plus aria-hidden="true" size={18} />
                {t("categories.newEnvelope") || "Amplop Baru"}
              </Button>
            )}
          </div>
        }
      />

      {/* Tab Switcher */}
      <FilterTabs
        options={tabOptions}
        value={activeTab}
        onChange={(val) => setActiveTab(val as "categories" | "envelopes")}
      />

      {error ? (
        <section className="rounded-xl border border-kash-expense/30 bg-white p-5 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900">{t("common.error")}</h3>
          <p className="mt-2 text-sm font-semibold text-slate-700">{error}</p>
          <Button className="mt-4" onClick={() => void loadData()}>
            {t("common.retry")}
          </Button>
        </section>
      ) : null}

      {loading ? <CategorySkeleton /> : null}

      {!loading && activeTab === "categories" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-center gap-2">
              <Tags aria-hidden="true" className="text-slate-600" size={18} />
              <h3 className="text-base font-extrabold text-slate-900">{t("categories.myCustomCategories") || "Kategori Kustom Saya"}</h3>
            </div>
            <div className="mt-4 grid gap-5">
              <div>
                <h4 className="mb-2 text-xs font-extrabold uppercase tracking-normal text-slate-700">{t("common.typeExpense")}</h4>
                {groupedCategories.customExpense.length > 0 ? (
                  <div className="grid gap-2">
                    {groupedCategories.customExpense.map((category) => (
                      <CategoryPill
                        category={category}
                        key={category.id}
                        onArchive={() => setArchiveTarget(category)}
                        onDelete={() => setDeleteTarget(category)}
                        onEdit={() => {
                          setEditingCategory(category);
                          setShowCategoryForm(true);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                    {t("categories.noCustomExpense") || "Belum ada kategori pengeluaran kustom."}
                  </p>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-xs font-extrabold uppercase tracking-normal text-slate-700">{t("common.typeIncome")}</h4>
                {groupedCategories.customIncome.length > 0 ? (
                  <div className="grid gap-2">
                    {groupedCategories.customIncome.map((category) => (
                      <CategoryPill
                        category={category}
                        key={category.id}
                        onArchive={() => setArchiveTarget(category)}
                        onDelete={() => setDeleteTarget(category)}
                        onEdit={() => {
                          setEditingCategory(category);
                          setShowCategoryForm(true);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                    {t("categories.noCustomIncome") || "Belum ada kategori pemasukan kustom."}
                  </p>
                )}
              </div>
            </div>
          </section>

          <div className="grid gap-5">
            <CategoryGroup categories={groupedCategories.systemExpense} title={t("categories.standardExpenseSystem") || "Kategori Pengeluaran Standar (Sistem)"} />
            <CategoryGroup categories={groupedCategories.systemIncome} title={t("categories.standardIncomeSystem") || "Kategori Pemasukan Standar (Sistem)"} />
          </div>
        </div>
      ) : null}

      {!loading && activeTab === "envelopes" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <h3 className="text-base font-black text-slate-900">{t("categories.myEnvelopesList") || "Daftar Amplop Saya"}</h3>
              <p className="text-xs font-semibold text-slate-600">
                {t("categories.envelopesSubtitle") || "Amplop digunakan untuk menandai transaksi dan membuat target budget tujuan spesifik"}
              </p>
            </div>
            <Button
              onClick={() => {
                setEditingEnvelope(null);
                setShowEnvelopeModal(true);
              }}
              className="gap-1.5 min-h-9 px-3 text-xs"
            >
              <Plus size={15} />
              {t("categories.addEnvelope") || "Tambah Amplop"}
            </Button>
          </div>

          {envelopes.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {envelopes.map((env) => (
                <EnvelopePill
                  key={env.id}
                  envelope={env}
                  onEdit={() => {
                    setEditingEnvelope(env);
                    setShowEnvelopeModal(true);
                  }}
                  onArchive={() => setArchiveEnvelopeTarget(env)}
                  onDelete={() => setDeleteEnvelopeTarget(env)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-kash-selected text-kash-emeraldDark mb-3">
                <Layers size={24} />
              </span>
              <h4 className="text-sm font-black text-slate-900">{t("categories.noEnvelopesTitle") || "Belum Ada Amplop"}</h4>
              <p className="mt-1 text-xs font-semibold text-slate-600 max-w-sm mx-auto">
                {t("categories.noEnvelopesDesc") || "Buat amplop seperti \"Date\", \"Liburan Akhir Tahun\", atau \"Servis Motor\" untuk mengelompokkan anggaran dan pengeluaran Anda."}
              </p>
              <Button
                onClick={() => {
                  setEditingEnvelope(null);
                  setShowEnvelopeModal(true);
                }}
                className="mt-4 gap-1.5"
              >
                <Plus size={16} />
                {t("categories.createFirstEnvelope") || "Buat Amplop Pertama"}
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {/* Category Form Modal */}
      {showCategoryForm ? (
        <CategoryFormModal
          category={editingCategory}
          onClose={() => {
            setShowCategoryForm(false);
            setEditingCategory(null);
          }}
          onSaved={() => {
            setShowCategoryForm(false);
            setEditingCategory(null);
            void loadData();
          }}
        />
      ) : null}

      {/* Envelope Form Modal */}
      <QuickCreateEnvelopeModal
        isOpen={showEnvelopeModal}
        envelopeToEdit={editingEnvelope}
        onClose={() => {
          setShowEnvelopeModal(false);
          setEditingEnvelope(null);
        }}
        onCreated={() => {
          setShowEnvelopeModal(false);
          setEditingEnvelope(null);
          void loadData();
        }}
      />

      {/* Category Archive Dialog */}
      {archiveTarget ? (
        <ConfirmationDialog
          confirmLabel={t("categories.archiveCategoryConfirm") || "Arsipkan Kategori"}
          description={t("categories.archiveCategoryDesc") || "Kategori ini akan disembunyikan dari pilihan transaksi aktif tetapi riwayat transaksi masa lalu tetap tersimpan."}
          icon={Archive}
          isLoading={archivingCategory}
          itemLabel={archiveTarget.name}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => void handleArchiveCategory(archiveTarget)}
          title={t("categories.archiveCategoryTitle") || "Arsipkan kategori ini?"}
          tone="warning"
        />
      ) : null}

      {/* Category Delete Dialog */}
      {deleteTarget ? (
        <ConfirmationDialog
          confirmLabel={deletingCategory ? t("common.deleting") : (t("common.deletePermanently") || "Hapus Permanen")}
          description={t("categories.deleteCategoryDesc") || "Apakah Anda yakin ingin menghapus kategori ini secara permanen? Kategori yang sudah memiliki riwayat transaksi tidak dapat dihapus dan disarankan untuk diarsipkan."}
          icon={Trash2}
          isLoading={deletingCategory}
          itemLabel={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDeleteCategory(deleteTarget)}
          title={t("categories.deleteCategoryTitle") || "Hapus Kategori Permanen?"}
          tone="danger"
        />
      ) : null}

      {/* Envelope Archive Dialog */}
      {archiveEnvelopeTarget ? (
        <ConfirmationDialog
          confirmLabel={t("categories.archiveEnvelopeConfirm") || "Arsipkan Amplop"}
          description={t("categories.archiveEnvelopeDesc") || "Amplop ini akan disembunyikan dari formulir aktif tetapi riwayat transaksi tetap terjaga."}
          icon={Archive}
          isLoading={archivingEnvelope}
          itemLabel={archiveEnvelopeTarget.name}
          onCancel={() => setArchiveEnvelopeTarget(null)}
          onConfirm={() => void handleArchiveEnvelope(archiveEnvelopeTarget)}
          title={t("categories.archiveEnvelopeTitle") || "Arsipkan amplop ini?"}
          tone="warning"
        />
      ) : null}

      {/* Envelope Delete Dialog */}
      {deleteEnvelopeTarget ? (
        <ConfirmationDialog
          confirmLabel={deletingEnvelope ? t("common.deleting") : (t("categories.deleteEnvelopeConfirm") || "Hapus Amplop")}
          description={t("categories.deleteEnvelopeDesc") || "Apakah Anda yakin ingin menghapus amplop ini secara permanen?"}
          icon={Trash2}
          isLoading={deletingEnvelope}
          itemLabel={deleteEnvelopeTarget.name}
          onCancel={() => setDeleteEnvelopeTarget(null)}
          onConfirm={() => void handleDeleteEnvelope(deleteEnvelopeTarget)}
          title={t("categories.deleteEnvelopeTitle") || "Hapus Amplop Permanen?"}
          tone="danger"
        />
      ) : null}
      <ContextualCreateAction
        targetRef={createActionRef}
        onClick={() => {
          if (activeTab === "categories") {
            setShowCategoryForm(true);
          } else {
            setEditingEnvelope(null);
            setShowEnvelopeModal(true);
          }
        }}
        label={activeTab === "categories" ? (t("categories.newCategory") || "Kategori Baru") : (t("categories.newEnvelope") || "Amplop Baru")}
      />
    </div>
  );
}
