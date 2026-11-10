import type { ChangeEvent, ChangeEventHandler } from "react";
import { Controller, type Control } from "react-hook-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sanitizeContactField, type ContactFieldKind, type ContactFormValues } from "../types";
import type { ContactFormVm } from "../controllers/useContactFormController";
import { ImportContactsPanel } from "../ImportContactsPanel";
import { ContactCountrySelect } from "../components/ContactCountrySelect";

function ContactSelect({
  id,
  name,
  control,
  options,
}: {
  id: string;
  name: "role" | "country";
  control: Control<ContactFormValues>;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Select name={field.name} value={field.value} onValueChange={field.onChange}>
          <SelectTrigger
            id={id}
            ref={field.ref}
            onBlur={field.onBlur}
            className="inp relative h-[52px] rounded-[14px] border-[#c7c7c7] bg-[#e8f0fe] px-4 py-0 text-base font-normal text-black focus:border-[#8b8b8b] focus:shadow-[0_0_0_2px_rgba(0,0,0,0.04)] [&>svg]:absolute [&>svg]:right-4 [&>svg]:top-1/2 [&>svg]:-translate-y-1/2"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            sideOffset={4}
            className="z-[80] w-[var(--radix-select-trigger-width)] rounded-[14px] border-[#d9dde5] bg-white p-1 text-base shadow-lg"
          >
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="min-h-11 cursor-pointer rounded-lg py-2.5 pl-3 pr-10 text-base font-normal text-[#344054] focus:bg-[#eef2ff] focus:text-[#2743b8] data-[state=checked]:bg-[#eef2ff] data-[state=checked]:font-semibold data-[state=checked]:text-[#2743b8]"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      className="mut3"
      style={{
        color: "var(--danger)",
        fontSize: "var(--workspace-font-caption, 11px)",
        marginTop: 4,
      }}
    >
      {message}
    </div>
  );
}

function withSanitize(
  onChange: ChangeEventHandler<HTMLInputElement>,
  kind: ContactFieldKind,
): ChangeEventHandler<HTMLInputElement> {
  return (e: ChangeEvent<HTMLInputElement>) => {
    e.target.value = sanitizeContactField(kind, e.target.value);
    onChange(e);
  };
}

export function ContactFormDialogView(vm: ContactFormVm) {
  const firstName = vm.register("firstName");
  const lastName = vm.register("lastName");
  const email = vm.register("email");
  const phone = vm.register("phone");
  const department = vm.register("department");
  const employeeCode = vm.register("employeeCode");
  const line1 = vm.register("line1");
  const city = vm.register("city");
  const state = vm.register("state");
  const pincode = vm.register("pincode");

  return (
    <Dialog open={vm.open} onOpenChange={vm.onOpenChange}>
      <DialogContent className="sm-modal contact-dialog flex flex-col">
        <div className="contact-dialog-top">
          <DialogHeader className="contact-dialog-header text-center sm:text-center">
            <DialogTitle className="text-[32px] font-bold leading-tight tracking-normal text-[#1f1f1f]">
              {vm.mode === "edit"
                ? "Fix recipient information"
                : vm.tab === "csv"
                  ? "Import contacts"
                  : "Add people"}
            </DialogTitle>
            {vm.mode === "edit" && (
              <DialogDescription>
                Update this person's details so they can be added to orders. HRIS-synced fields will
                override manual entries.
              </DialogDescription>
            )}
            {vm.mode === "add" && (
              <DialogDescription className="sr-only">
                Enter contact details manually or upload a contact file.
              </DialogDescription>
            )}
          </DialogHeader>

          {vm.mode === "add" && vm.canImportContacts && (
            <div
              className="tabs contact-dialog-tabs"
              role="group"
              aria-label="Contact entry method"
            >
              {(
                [
                  ["manual", "Manually"],
                  ["csv", "Upload file"],
                ] as const
              ).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={vm.tab === key ? "on" : ""}
                  aria-pressed={vm.tab === key}
                  onClick={() => vm.onTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {vm.mode === "add" && vm.tab === "csv" ? (
          <div className="contact-dialog-import">
            <ImportContactsPanel onDone={vm.onImportDone} onImportSuccess={vm.onImportSuccess} />
          </div>
        ) : (
          <form className="contact-form" onSubmit={vm.onSubmit} noValidate>
            <div className="contact-form-fields">
              <div className="contact-form-row">
                <div className="field">
                  <label className="lbl" htmlFor="ac-first">
                    First name
                  </label>
                  <input
                    id="ac-first"
                    placeholder="e.g. Alex"
                    className="inp"
                    {...firstName}
                    onChange={withSanitize(firstName.onChange, "personName")}
                    aria-invalid={Boolean(vm.errors.firstName)}
                  />
                  <FieldError message={vm.errors.firstName?.message} />
                </div>
                <div className="field">
                  <label className="lbl" htmlFor="ac-last">
                    Last name
                  </label>
                  <input
                    id="ac-last"
                    placeholder="e.g. Morgan"
                    className="inp"
                    {...lastName}
                    onChange={withSanitize(lastName.onChange, "personName")}
                    aria-invalid={Boolean(vm.errors.lastName)}
                  />
                  <FieldError message={vm.errors.lastName?.message} />
                </div>
              </div>
              <div className="contact-form-row">
                <div className="field">
                  <label className="lbl" htmlFor="ac-email">
                    Email
                  </label>
                  <input
                    id="ac-email"
                    placeholder="you@company.com"
                    type="email"
                    className="inp"
                    {...email}
                    onChange={withSanitize(email.onChange, "email")}
                    aria-invalid={Boolean(vm.errors.email)}
                  />
                  <FieldError message={vm.errors.email?.message} />
                </div>
                <div className="field">
                  <label className="lbl" htmlFor="ac-phone">
                    Phone
                  </label>
                  <input
                    id="ac-phone"
                    className="inp"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    {...phone}
                    onChange={withSanitize(phone.onChange, "phone")}
                    aria-invalid={Boolean(vm.errors.phone)}
                  />
                  <FieldError message={vm.errors.phone?.message} />
                </div>
              </div>
              <div className="contact-form-row">
                <div className="field">
                  <label className="lbl" htmlFor="ac-role">
                    Role
                  </label>
                  {vm.canManageContactRoles ? (
                    <ContactSelect
                      id="ac-role"
                      name="role"
                      control={vm.control}
                      options={vm.roleOptions.map((role) => ({ value: role, label: role }))}
                    />
                  ) : (
                    <>
                      <input type="hidden" {...vm.register("role")} />
                      <input id="ac-role" className="inp" value={vm.roleDisplay} readOnly />
                    </>
                  )}
                </div>
                <div className="field">
                  <label className="lbl" htmlFor="ac-dept">
                    Department
                  </label>
                  <input
                    id="ac-dept"
                    placeholder="e.g. Marketing"
                    className="inp"
                    {...department}
                  />
                </div>
              </div>
              <div className="contact-form-row">
                <div className="field">
                  <label className="lbl" htmlFor="ac-emp">
                    Employee Code
                  </label>
                  <input id="ac-emp" placeholder="e.g. EMP001" className="inp" {...employeeCode} />
                </div>
                <div className="field">
                  <label className="lbl" htmlFor="ac-country">
                    Country
                  </label>
                  <Controller
                    name="country"
                    control={vm.control}
                    render={({ field }) => (
                      <ContactCountrySelect
                        id="ac-country"
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        triggerRef={field.ref}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="field">
                <label className="lbl" htmlFor="ac-address">
                  Address
                </label>
                <input id="ac-address" placeholder="Street address" className="inp" {...line1} />
              </div>
              <div className="contact-form-row contact-form-row--3">
                <div className="field">
                  <label className="lbl" htmlFor="ac-city">
                    City
                  </label>
                  <input
                    id="ac-city"
                    placeholder="e.g. Mumbai"
                    className="inp"
                    {...city}
                    onChange={withSanitize(city.onChange, "city")}
                    aria-invalid={Boolean(vm.errors.city)}
                  />
                  <FieldError message={vm.errors.city?.message} />
                </div>
                <div className="field">
                  <label className="lbl" htmlFor="ac-state">
                    State
                  </label>
                  <input
                    id="ac-state"
                    placeholder="e.g. Maharashtra"
                    className="inp"
                    {...state}
                    onChange={withSanitize(state.onChange, "state")}
                    aria-invalid={Boolean(vm.errors.state)}
                  />
                  <FieldError message={vm.errors.state?.message} />
                </div>
                <div className="field contact-form-pin">
                  <label className="lbl" htmlFor="ac-pin">
                    PIN Code
                  </label>
                  <input
                    id="ac-pin"
                    placeholder="e.g. 400001"
                    className="inp"
                    inputMode="numeric"
                    maxLength={10}
                    {...pincode}
                    onChange={withSanitize(pincode.onChange, "postal")}
                    aria-invalid={Boolean(vm.errors.pincode)}
                  />
                  <FieldError message={vm.errors.pincode?.message} />
                </div>
              </div>
            </div>
            <div className="contact-form-footer">
              <button type="button" className="btn btn-ghost" onClick={vm.onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn btn-brand" disabled={vm.busy}>
                {vm.busy ? "Saving…" : vm.mode === "edit" ? "Save" : "Add contacts"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
