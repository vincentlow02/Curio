"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { Icon } from "./icon";

type Option = { value: string; label: string };

export function SettingsDropdown({ id, label, value, options, disabled = false, open, onOpenChange, onChange }: { id: string; label: string; value: string; options: Option[]; disabled?: boolean; open: boolean; onOpenChange: (open: boolean) => void; onChange: (value: string) => void }): React.ReactElement {
  return (
    <div className="relative">
      <Select.Root value={value} disabled={disabled} open={open} onOpenChange={onOpenChange} onValueChange={onChange}>
        <Select.Trigger
          id={id}
          className="flex cursor-pointer items-center justify-end gap-[10px] rounded-lg border-0 bg-transparent py-[9px] pr-[4px] pl-[12px] text-[14px]! text-[#222] hover:bg-[#f6f6f6] disabled:cursor-not-allowed disabled:text-[#999]"
          aria-label={label}
        >
          <Select.Value />
          <Select.Icon aria-hidden="true">
            <Icon icon={ChevronDown} className="size-[18px] shrink-0" size={18} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="z-[120] w-[min(180px,calc(100vw-96px))] min-w-0 rounded-[14px] border-[1px] border-solid border-[#d2d2d2] bg-white p-[5px] shadow-[0_4px_12px_rgb(0_0_0_/_8%)]"
            position="popper"
            sideOffset={5}
            collisionPadding={8}
          >
            <Select.Viewport>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex min-h-[36px] w-full cursor-pointer items-center justify-between gap-3 rounded-[9px] border-0 bg-transparent px-[10px] py-2 text-left text-[13px] text-[#222] outline-none data-[state=checked]:bg-[#f4f4f4] data-[highlighted]:bg-[#f4f4f4] focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-[#ddd] focus-visible:outline-offset-[-1px]"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="flex items-center">
                    <Icon icon={Check} size={15} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
