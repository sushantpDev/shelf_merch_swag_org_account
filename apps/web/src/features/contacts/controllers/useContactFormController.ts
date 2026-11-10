import { useEffect, useState } from "react";
import {
  useForm,
  type Control,
  type FieldErrors,
  type Resolver,
  type UseFormRegister,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useAddContact, useUpdateContact } from "../model";
import type { UiContact } from "../model";
import {
  ADD_ROLES,
  EMPTY_CONTACT,
  ROLES,
  contactSchema,
  contactToForm,
  type ContactFormValues,
} from "../types";

export type ContactFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  contact?: UiContact;
  canImportContacts?: boolean;
  /** Company admin only — entity managers cannot change contact roles. */
  canManageContactRoles?: boolean;
  /** When opening add dialog, start on manual or CSV import tab. */
  initialTab?: "manual" | "csv";
  /** Fired after a successful manual add or file import (count of contacts added). */
  onAddedSuccess?: (count: number) => void;
};

export type ContactFormVm = {
  open: boolean;
  mode: "add" | "edit";
  tab: "manual" | "csv";
  canImportContacts: boolean;
  canManageContactRoles: boolean;
  roleOptions: readonly string[];
  roleDisplay: string;
  busy: boolean;
  register: UseFormRegister<ContactFormValues>;
  control: Control<ContactFormValues>;
  errors: FieldErrors<ContactFormValues>;
  onOpenChange: (open: boolean) => void;
  onTab: (tab: "manual" | "csv") => void;
  onSubmit: React.FormEventHandler;
  onCancel: () => void;
  onImportDone: () => void;
  onImportSuccess: (count: number) => void;
};

/** Controller for the add/edit contact dialog: react-hook-form + add/update flows. */
export function useContactFormController({
  open,
  onOpenChange,
  mode,
  contact,
  canImportContacts = true,
  canManageContactRoles = true,
  initialTab = "manual",
  onAddedSuccess,
}: ContactFormProps): ContactFormVm {
  const [tab, setTab] = useState<"manual" | "csv">("manual");
  const addContact = useAddContact();
  const updateContact = useUpdateContact();

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ContactFormValues>({
    // zod `.default("")` fields make the schema's input type wider than the
    // inferred output; the resolver runs identically, so assert the form type.
    resolver: zodResolver(contactSchema) as Resolver<ContactFormValues>,
    defaultValues: EMPTY_CONTACT,
    mode: "onTouched",
  });

  const watchedRole = watch("role");

  // Reset the form whenever the dialog opens or the target contact changes.
  useEffect(() => {
    if (!open) return;
    setTab(mode === "add" ? initialTab : "manual");
    reset(mode === "edit" && contact ? contactToForm(contact) : EMPTY_CONTACT);
  }, [open, mode, contact, initialTab, reset]);

  async function submit(values: ContactFormValues) {
    const lockedRole = !canManageContactRoles
      ? mode === "edit" && contact
        ? contactToForm(contact).role
        : ("Member" as ContactFormValues["role"])
      : values.role;
    const payload = { ...values, role: lockedRole };

    try {
      if (mode === "edit" && contact) {
        await updateContact.mutateAsync({ id: contact.id, values: payload });
        toast.success("Recipient details saved");
        onOpenChange(false);
      } else {
        await addContact.mutateAsync(payload);
        toast.success("Contact added");
        onOpenChange(false);
        onAddedSuccess?.(1);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save contact");
    }
  }

  return {
    open,
    mode,
    tab,
    canImportContacts,
    canManageContactRoles,
    roleOptions: mode === "edit" ? ROLES : ADD_ROLES,
    roleDisplay: watchedRole || (mode === "edit" && contact ? contact.role : "Member"),
    busy: addContact.isPending || updateContact.isPending,
    register,
    control,
    errors,
    onOpenChange,
    onTab: setTab,
    onSubmit: handleSubmit(submit),
    onCancel: () => onOpenChange(false),
    onImportDone: () => onOpenChange(false),
    onImportSuccess: (count) => {
      if (count <= 0) return;
      onOpenChange(false);
      onAddedSuccess?.(count);
    },
  };
}
