import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchOption = { value: string; label: string; hint?: string };

export function SearchSelect({
  value,
  options,
  onSelect,
  onCreate,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  createLabel = "Add new",
  disabled,
  className,
}: {
  value: string;
  options: SearchOption[];
  onSelect: (value: string) => void;
  onCreate?: (value: string) => void | Promise<void>;
  placeholder?: string;
  searchPlaceholder?: string;
  createLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const exact = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="p-2 text-sm text-muted-foreground">
              No match found.
            </CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""}`}
                  onSelect={() => {
                    onSelect(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{o.label}</span>
                  {o.hint ? (
                    <span className="ml-auto pl-3 text-xs text-muted-foreground">{o.hint}</span>
                  ) : null}
                </CommandItem>
              ))}
              {onCreate && query.trim() && !exact ? (
                <CommandItem
                  value={`__create__${query}`}
                  onSelect={async () => {
                    const name = query.trim();
                    setOpen(false);
                    setQuery("");
                    await onCreate(name);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {createLabel} “{query.trim()}”
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
