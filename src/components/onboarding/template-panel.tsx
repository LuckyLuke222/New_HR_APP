"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  createTemplate,
  toggleTemplate,
  addTemplateItem,
  deleteTemplateItem,
  type OnboardingActionState,
} from "@/server/actions/onboarding";
import type { OnboardingTemplate } from "@/server/dal/onboarding";

const initial: OnboardingActionState = { success: false, message: "" };

type Props = {
  templates: OnboardingTemplate[];
};

export function TemplatePanel({ templates }: Props) {
  return (
    <div className="space-y-6">
      <CreateTemplateForm />

      {templates.length > 0 && (
        <div className="space-y-4">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}

      {templates.length === 0 && (
        <div className="rounded-md border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
          No templates yet. Create one above.
        </div>
      )}
    </div>
  );
}

function CreateTemplateForm() {
  const [state, action, pending] = useActionState(createTemplate, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="rounded-md border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">New template</h3>

      {state.message && (
        <p
          role={state.success ? undefined : "alert"}
          className={`rounded-md border px-3 py-2 text-sm ${
            state.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="tpl-name" className="mb-1 block text-sm font-medium text-foreground">
            Name
          </label>
          <input
            id="tpl-name"
            name="name"
            type="text"
            defaultValue={state.values?.name ?? ""}
            placeholder="e.g. Engineering onboarding"
            required
            maxLength={100}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus:outline-none focus:ring-2 focus-visible:ring-ring"
          />
          {state.fieldErrors?.name && (
            <p className="mt-1 text-xs text-destructive">{state.fieldErrors.name[0]}</p>
          )}
        </div>
        <div>
          <label htmlFor="tpl-desc" className="mb-1 block text-sm font-medium text-foreground">
            Description <span className="text-muted-foreground/70">(optional)</span>
          </label>
          <input
            id="tpl-desc"
            name="description"
            type="text"
            defaultValue={state.values?.description ?? ""}
            placeholder="Short description"
            maxLength={500}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus:outline-none focus:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Creating…" : "Create template"}
        </Button>
        {state.message && (
          <p
            role={state.success ? "status" : "alert"}
            className={`text-sm ${state.success ? "text-emerald-700" : "text-destructive"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

function TemplateCard({ template }: { template: OnboardingTemplate }) {
  const [toggleState, toggleAction, togglePending] = useActionState(toggleTemplate, initial);

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{template.name}</p>
          {template.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${
              template.isActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border bg-muted text-muted-foreground"
            }`}
          >
            {template.isActive ? "Active" : "Inactive"}
          </span>
          <form action={toggleAction}>
            <input type="hidden" name="templateId" value={template.id} />
            <button
              type="submit"
              disabled={togglePending}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
            >
              {togglePending ? "…" : template.isActive ? "Deactivate" : "Activate"}
            </button>
          </form>
        </div>
      </div>

      {toggleState.message && !toggleState.success && (
        <div className="px-4 pt-2">
          <p role="alert" className="text-xs text-destructive">{toggleState.message}</p>
        </div>
      )}

      {/* Existing items */}
      {template.items.length > 0 && (
        <ul className="divide-y divide-border">
          {template.items.map((item) => (
            <TemplateItemRow key={item.id} itemId={item.id} title={item.title} description={item.description} />
          ))}
        </ul>
      )}

      {template.items.length === 0 && (
        <p className="px-4 py-3 text-xs text-muted-foreground/70">No tasks yet. Add one below.</p>
      )}

      {/* Add item form */}
      <AddItemForm templateId={template.id} />
    </div>
  );
}

function TemplateItemRow({
  itemId,
  title,
  description,
}: {
  itemId: string;
  title: string;
  description: string | null;
}) {
  const [state, action, pending] = useActionState(deleteTemplateItem, initial);

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground/70 truncate">{description}</p>}
        {state.message && !state.success && (
          <p role="alert" className="text-xs text-destructive">{state.message}</p>
        )}
      </div>
      <form action={action} className="shrink-0">
        <input type="hidden" name="itemId" value={itemId} />
        <button
          type="submit"
          disabled={pending}
          className="text-xs text-destructive hover:underline disabled:opacity-50"
          onClick={(e) => {
            if (!confirm("Remove this task from the template?")) e.preventDefault();
          }}
        >
          {pending ? "…" : "Remove"}
        </button>
      </form>
    </li>
  );
}

function AddItemForm({ templateId }: { templateId: string }) {
  const [state, action, pending] = useActionState(addTemplateItem, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="border-t border-border px-4 py-3 space-y-2">
      <input type="hidden" name="templateId" value={templateId} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <label className="sr-only">Task title</label>
          <input
            name="title"
            type="text"
            defaultValue={state.values?.title ?? ""}
            placeholder="Task title"
            required
            maxLength={200}
            className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus:outline-none focus:ring-2 focus-visible:ring-ring"
          />
          {state.fieldErrors?.title && (
            <p className="mt-1 text-xs text-destructive">{state.fieldErrors.title[0]}</p>
          )}
        </div>
        <div>
          <label className="sr-only">Description (optional)</label>
          <input
            name="description"
            type="text"
            defaultValue={state.values?.description ?? ""}
            placeholder="Description (optional)"
            maxLength={500}
            className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus:outline-none focus:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add task"}
        </Button>
      </div>
      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          className={`text-xs ${state.success ? "text-emerald-700" : "text-destructive"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
