"use client";

import * as React from "react";
import { cn } from "./utils";
import { Input } from "./input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "./command";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "./popover";

interface ComboboxProps {
  options: string[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  required?: boolean;
  id?: string;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select or type...",
  searchPlaceholder = "Search...",
  emptyMessage = "No option found.",
  required = false,
  id,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  const [searchValue, setSearchValue] = React.useState('');
  const [popoverWidth, setPopoverWidth] = React.useState<number | undefined>(undefined);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);

  // Update input value when value prop changes (e.g., from parent)
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Update popover width when input width changes
  React.useEffect(() => {
    if (anchorRef.current) {
      setPopoverWidth(anchorRef.current.offsetWidth);
    }
  }, [open]);

  // Reset search value when popover opens
  React.useEffect(() => {
    if (open) {
      setSearchValue('');
    }
  }, [open]);

  // Filter options based on search value (not input value)
  const filteredOptions = React.useMemo(() => {
    if (!searchValue) return options;
    const lowerSearch = searchValue.toLowerCase();
    return options.filter((option) =>
      option.toLowerCase().includes(lowerSearch)
    );
  }, [searchValue, options]);

  const handleSelect = (selectedValue: string) => {
    setInputValue(selectedValue);
    onValueChange(selectedValue);
    setOpen(false);
    // Keep focus on input after selection
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setSearchValue(newValue);
    onValueChange(newValue);
    setOpen(true);
  };

  const handleInputClick = () => {
    // Always open dropdown when clicking, regardless of current value
    setOpen(true);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter" && filteredOptions.length === 1) {
      // Auto-select if only one option matches
      handleSelect(filteredOptions[0]);
      e.preventDefault();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative w-full">
          <Input
            ref={inputRef}
            id={id}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onClick={handleInputClick}
            placeholder={placeholder}
            required={required}
          />
        </div>
      </PopoverAnchor>
        <PopoverContent 
          className="p-0"
          align="start"
          side="bottom"
          sideOffset={4}
          style={{ width: popoverWidth ? `${popoverWidth}px` : undefined }}
        >
          <Command shouldFilter={false}>
            <CommandList className="!max-h-[320px]">
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={() => handleSelect(option)}
                      className={cn(
                        "cursor-pointer transition-colors",
                        value === option && "bg-accent"
                      )}
                    >
                      {option}
                    </CommandItem>
                  ))
                ) : (
                  <CommandItem disabled>No matches found</CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
    </Popover>
  );
}

