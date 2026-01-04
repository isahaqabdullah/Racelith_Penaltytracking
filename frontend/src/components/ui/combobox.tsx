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
  /** If true, disable collision handling so the popover always opens below the field (default). */
  forceBottom?: boolean;
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
  forceBottom = true,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  const [searchValue, setSearchValue] = React.useState('');
  const [popoverWidth, setPopoverWidth] = React.useState<number | undefined>(undefined);
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);
  const [availableHeight, setAvailableHeight] = React.useState<number>(400);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);

  const updateAvailableHeight = React.useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - 8; // offset for sideOffset/margin
    const spaceAbove = rect.top - 8;
    const preferred = forceBottom ? spaceBelow : Math.max(spaceBelow, spaceAbove);
    const clamped = Math.max(200, Math.min(preferred, viewportHeight - 32));
    setAvailableHeight(clamped);
  }, [forceBottom]);

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
      updateAvailableHeight();
    }
  }, [open, updateAvailableHeight]);

  // Portal to dialog content when present so dropdown moves with the modal and stays aligned while scrolling/zooming
  React.useEffect(() => {
    if (open && anchorRef.current) {
      const dialogContent = anchorRef.current.closest('[data-slot="dialog-content"]') as HTMLElement | null;
      setPortalContainer(dialogContent);
    } else if (!open) {
      setPortalContainer(null);
    }
  }, [open]);

  // Recompute available height on viewport changes while open
  React.useLayoutEffect(() => {
    if (!open) return;
    updateAvailableHeight();
    const handler = () => updateAvailableHeight();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [open, updateAvailableHeight]);

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
        className="p-0 z-[9999] max-h-[70vh] overflow-y-auto"
        align="start"
        side="bottom"
        sideOffset={6}
        avoidCollisions={false}
        updatePositionStrategy="always"
        collisionPadding={8}
        sticky="always"
        container={portalContainer ?? undefined}
        style={{
          width: popoverWidth ? `${popoverWidth}px` : undefined,
          maxHeight: `${availableHeight}px`,
          overflowX: 'visible',
          zIndex: 9999,
        }}
      >
        <Command shouldFilter={false} className="max-h-[60vh] overflow-y-auto">
          <CommandList
            className="overflow-y-auto"
            style={{
              maxHeight: `${Math.max(180, availableHeight - 12)}px`,
            }}
          >
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => handleSelect(option)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground",
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
