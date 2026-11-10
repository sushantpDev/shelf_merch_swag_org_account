import { useState, type Ref } from "react";
import { Check, ChevronDown } from "lucide-react";
import { COUNTRY_OPTIONS } from "@/data/countries";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const SEARCH_ALIASES: Record<string, string[]> = {
  US: ["USA", "United States of America"],
  AE: ["UAE"],
  GB: ["UK", "Great Britain"],
};

function CountryFlag({ code }: { code: string }) {
  return (
    <img
      src={`/flags/${code.toLowerCase()}.svg`}
      alt=""
      aria-hidden="true"
      width={20}
      height={15}
      loading="lazy"
      className="h-[15px] w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-black/10"
    />
  );
}

export function ContactCountrySelect({
  id,
  value,
  onValueChange,
  onBlur,
  triggerRef,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  onBlur: () => void;
  triggerRef: Ref<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const selected = COUNTRY_OPTIONS.find((country) => country.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          ref={triggerRef}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="inp relative flex h-[52px] w-full items-center rounded-[14px] border-[#c7c7c7] bg-[#e8f0fe] px-4 py-0 text-left text-base font-normal text-black"
        >
          <span className="flex min-w-0 items-center gap-2 pr-6">
            {selected && <CountryFlag code={selected.value} />}
            <span className="truncate">{selected?.label ?? "Select country"}</span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6b7280]"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="z-[80] w-[var(--radix-popover-trigger-width)] max-h-[var(--radix-popover-content-available-height)] overflow-hidden rounded-[14px] border-[#d9dde5] bg-white p-0 shadow-lg"
      >
        <Command label="Search countries" defaultValue={value} className="bg-white text-[#344054]">
          <CommandInput
            placeholder="Search countries…"
            aria-label="Search countries"
            className="h-11 text-base"
          />
          <CommandList
            className="min-h-0 overflow-y-auto"
            style={{
              maxHeight: "min(256px, calc(var(--radix-popover-content-available-height) - 48px))",
            }}
          >
            <CommandEmpty>No countries found.</CommandEmpty>
            <CommandGroup className="p-1.5">
              {COUNTRY_OPTIONS.map((country) => (
                <CommandItem
                  key={country.value}
                  value={country.value}
                  keywords={[country.label, ...(SEARCH_ALIASES[country.value] ?? [])]}
                  data-current={value === country.value}
                  onSelect={() => {
                    onValueChange(country.value);
                    setOpen(false);
                  }}
                  className="min-h-11 cursor-pointer gap-3 rounded-lg px-3 py-2.5 text-base data-[selected=true]:bg-[#eef2ff] data-[selected=true]:text-[#2743b8] data-[current=true]:font-semibold data-[current=true]:text-[#2743b8]"
                >
                  <CountryFlag code={country.value} />
                  <span className="min-w-0 flex-1">{country.label}</span>
                  {value === country.value && (
                    <Check
                      size={16}
                      aria-hidden="true"
                      className="ml-auto shrink-0 text-[#2743b8]"
                    />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
