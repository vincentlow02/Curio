"use client";

import * as Select from "@radix-ui/react-select";
import { useCallback, useState } from "react";

type Option = { value: string; label: string };

export function SettingsDropdown({ id, label, value, options, disabled = false, onChange }: { id: string; label: string; value: string; options: Option[]; disabled?: boolean; onChange: (value: string) => void }): React.ReactElement {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const setRoot = useCallback((element: HTMLDivElement | null): void => {
    if (element) setPortalContainer(element.closest("dialog"));
  }, []);

  return (
    <div ref={setRoot} className="relative">
      <Select.Root value={value} disabled={disabled} onValueChange={onChange}>
        <Select.Trigger
          id={id}
          className="flex cursor-pointer items-center justify-end gap-[10px] rounded-lg border-0 bg-transparent py-[9px] pr-[4px] pl-[12px] text-[14px]! text-[#222] hover:bg-[#f6f6f6] disabled:cursor-not-allowed disabled:text-[#999]"
          aria-label={label}
        >
          <Select.Value />
          <Select.Icon aria-hidden="true">
            <svg className="size-[18px] shrink-0 fill-none stroke-current [stroke-width:1.5] [stroke-linecap:round] [stroke-linejoin:round]" viewBox="0 0 20 20"><path d="m4 7 6 6 6-6" /></svg>
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal container={portalContainer ?? undefined}>
          <Select.Content
            className="z-[2] w-[min(180px,calc(100vw-96px))] min-w-0 rounded-[14px] border-[1px] border-solid border-[#d2d2d2] bg-white p-[5px] shadow-[0_4px_12px_rgb(0_0_0_/_8%)] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:1.5] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:shrink-0 [&_svg]:size-[15px]"
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
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-10" /></svg>
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
