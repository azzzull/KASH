import { Archive, Edit3, Loader2, Plus, Tags } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { FormField } from "../components/ui/FormField";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { archiveCategory, createCategory, getSystemCategories, getUserCategories, updateCategory } from "../lib/categories";
import { categoryColors, categoryIconOptions, getCategoryIcon, isAllowedCategoryColor } from "../lib/categoryMeta";
import type { Category, CategoryType } from "../types/domain";

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

function CategoryPill({ category, onArchive, onEdit }: { category: Category; onArchive?: () => void; onEdit?: () => void }) {
  const Icon = getCategoryIcon(category.icon);

  return (
    <article className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <span
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-900"
        style={{ color: category.color ?? "#91A3BB" }}
      >
        <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-extrabold text-slate-900">{category.name}</span>
        <span className="mt-1 block text-xs font-bold uppercase tracking-normal text-slate-600">
          {category.is_system ? "System" : "Custom"}
        </span>
      </span>
      {category.is_system ? (
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Read only</span>
      ) : (
        <span className="flex gap-2">
          <Button onClick={onEdit} variant="secondary">
            <Edit3 aria-hidden="true" size={16} />
            Edit
          </Button>
          <Button onClick={onArchive} variant="secondary">
            <Archive aria-hidden="true" size={16} />
            Archive
          </Button>
        </span>
      )}
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
      setError("Category name is required.");
      return;
    }

    if (!isAllowedCategoryColor(form.color)) {
      setError("Choose a supported category color.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: saveError } = category
        ? await updateCategory(category, {
            name,
            icon: form.icon,
            color: form.color,
          })
        : await createCategory({
            name,
            categoryType: form.categoryType,
            icon: form.icon,
            color: form.color,
          });

      if (saveError) {
        setError("Couldn't save this category. Please check the details and try again.");
        setSaving(false);
        return;
      }

      onSaved();
    } catch {
      setError(category?.is_system ? "System categories cannot be changed." : "Couldn't save this category. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close category form" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">{isEditing ? "Edit Category" : "New Category"}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">
              {isEditing ? "Category type is locked to protect future transaction meaning." : "Create a custom income or expense category."}
            </p>
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
          <FormField id="category-name" label="Name" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Coffee" value={form.name} />
          <SelectField
            disabled={isEditing}
            id="category-type"
            label="Type"
            onChange={(event) => setForm((current) => ({ ...current, categoryType: event.target.value as CategoryType }))}
            value={form.categoryType}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </SelectField>
          <SelectField id="category-icon" label="Icon" onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} value={form.icon}>
            {categoryIconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <fieldset>
            <legend className="text-sm font-bold text-slate-900">Color Accent</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {categoryColors.map((color) => (
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
          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {isEditing ? "Save Changes" : "Create Category"}
          </Button>
        </form>
      </section>
    </div>
  );
}

function CategoryGroup({ categories, title }: { categories: Category[]; title: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
      <div className="mt-4 grid gap-2">
        {categories.map((category) => (
          <CategoryPill key={category.id} category={category} />
        ))}
      </div>
    </section>
  );
}

function CategorySkeleton() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((item) => (
        <div className="h-16 rounded-lg border border-slate-200 bg-white p-3" key={item}>
          <div className="h-3 w-1/3 rounded-full bg-slate-100" />
          <div className="mt-3 h-3 w-2/3 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function CategoriesPage() {
  const [systemCategories, setSystemCategories] = useState<Category[]>([]);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);

    const [systemResult, userResult] = await Promise.all([getSystemCategories(), getUserCategories()]);

    if (systemResult.error || userResult.error || !systemResult.data || !userResult.data) {
      setError("Couldn't load categories. Please try again.");
      setLoading(false);
      return;
    }

    setSystemCategories(systemResult.data);
    setCustomCategories(userResult.data.filter((category) => !category.is_archived));
    setLoading(false);
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const grouped = useMemo(() => {
    const activeSystem = systemCategories.filter((category) => !category.is_archived);
    return {
      customExpense: customCategories.filter((category) => category.category_type === "expense"),
      customIncome: customCategories.filter((category) => category.category_type === "income"),
      systemExpense: activeSystem.filter((category) => category.category_type === "expense"),
      systemIncome: activeSystem.filter((category) => category.category_type === "income"),
    };
  }, [customCategories, systemCategories]);

  const handleArchive = async (category: Category) => {
    setArchiving(true);
    try {
      const { error: archiveError } = await archiveCategory(category);

      if (archiveError) {
        setError("Couldn't archive this category. Please try again.");
        setArchiving(false);
        setArchiveTarget(null);
        return;
      }

      setArchiveTarget(null);
      await loadCategories();
    } catch {
      setError("System categories cannot be archived.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 p-4 md:p-6">
      <PageHeader
        eyebrow="Settings"
        icon={Tags}
        title="Categories"
        description="Manage income and expense labels."
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus aria-hidden="true" size={18} />
            New Category
          </Button>
        }
      />

      {error ? (
        <section className="rounded-lg border border-kash-expense/30 bg-white p-5 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900">Something went wrong.</h3>
          <p className="mt-2 text-sm font-semibold text-slate-700">{error}</p>
          <Button className="mt-4" onClick={() => void loadCategories()}>
            Retry
          </Button>
        </section>
      ) : null}

      {loading ? <CategorySkeleton /> : null}

      {!loading ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-center gap-2">
              <Tags aria-hidden="true" className="text-slate-600" size={18} />
              <h3 className="text-base font-extrabold text-slate-900">Custom Categories</h3>
            </div>
            <div className="mt-4 grid gap-5">
              <div>
                <h4 className="mb-2 text-xs font-extrabold uppercase tracking-normal text-slate-700">Expense</h4>
                {grouped.customExpense.length > 0 ? (
                  <div className="grid gap-2">
                    {grouped.customExpense.map((category) => (
                      <CategoryPill
                        category={category}
                        key={category.id}
                        onArchive={() => setArchiveTarget(category)}
                        onEdit={() => {
                          setEditingCategory(category);
                          setShowForm(true);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                    No custom expense categories yet.
                  </p>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-xs font-extrabold uppercase tracking-normal text-slate-700">Income</h4>
                {grouped.customIncome.length > 0 ? (
                  <div className="grid gap-2">
                    {grouped.customIncome.map((category) => (
                      <CategoryPill
                        category={category}
                        key={category.id}
                        onArchive={() => setArchiveTarget(category)}
                        onEdit={() => {
                          setEditingCategory(category);
                          setShowForm(true);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                    No custom income categories yet.
                  </p>
                )}
              </div>
            </div>
          </section>

          <div className="grid gap-5">
            <CategoryGroup categories={grouped.systemExpense} title="System Expense Categories" />
            <CategoryGroup categories={grouped.systemIncome} title="System Income Categories" />
          </div>
        </div>
      ) : null}

      {showForm ? (
        <CategoryFormModal
          category={editingCategory}
          onClose={() => {
            setShowForm(false);
            setEditingCategory(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditingCategory(null);
            void loadCategories();
          }}
        />
      ) : null}
      {archiveTarget ? (
        <ConfirmationDialog
          confirmLabel="Archive Category"
          description="This category will disappear from active selectors while preserving future history."
          icon={Archive}
          isLoading={archiving}
          itemLabel={archiveTarget.name}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => void handleArchive(archiveTarget)}
          title="Archive this category?"
          tone="warning"
        />
      ) : null}
    </div>
  );
}
