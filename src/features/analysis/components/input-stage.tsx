"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowUp, Camera, Check, CircleHelp, FileUp, Image, Mic, Plus, Sparkles, X } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useRef, type RefObject } from "react";
import type { CollectibleCategory } from "../../../core/profile/types";
import { Icon } from "../../../components/ui/icon";
import { uiCopy, type UiLocale } from "../locales";
import type { PendingInput } from "../types";

type SelectedImage = { file: File; name: string; url: string } | null;

export type { PendingInput } from "../types";

type InputStageProps = {
  locale: UiLocale;
  query: string;
  selectedCategory: CollectibleCategory | null;
  selectedImage: SelectedImage;
  collectorMode: boolean;
  clarificationRequested: boolean;
  creating: boolean;
  submitActive: boolean;
  speechSupported: boolean;
  speechListening: boolean;
  interimTranscript: string;
  onQueryChange: (value: string) => void;
  onCategoryChange: (category: CollectibleCategory | null) => void;
  onImageSelect: (file: File | null) => void;
  onImageClear: () => void;
  onCollectorModeChange: (enabled: boolean) => void;
  onSpeechToggle: () => void;
  onSubmit: (input: PendingInput) => void;
};

const categories = [
  { id: "toys", title: "Toys & Character Collectibles" as const, image: "/figma/category-toys.png" },
  { id: "games", title: "Cards & Game Collectibles" as const, image: "/figma/category-games.png" },
  { id: "music", title: "Records & Music Collectibles" as const, image: "/figma/category-music.png" },
] satisfies ReadonlyArray<{ id: string; title: CollectibleCategory; image: string }>;

function CategorySelector({
  selectedCategory,
  labels,
  onCategoryChange,
}: Pick<InputStageProps, "selectedCategory" | "onCategoryChange"> & { labels: readonly string[] }): React.ReactElement {
  return (
    <div className={`figma-category-grid flex h-[209px] w-[min(628px,100%)] items-center justify-between gap-[10px] min-[768px]:gap-[normal] [@media(max-width:767px)]:grid [@media(max-width:767px)]:h-auto [@media(max-width:767px)]:w-full [@media(max-width:767px)]:grid-cols-[1fr]${selectedCategory ? " is-hidden" : ""}`}>
      {categories.map((category, categoryIndex) => (
        <button className={`figma-category-card figma-category-card--${category.id}`} type="button" key={category.id} onClick={() => onCategoryChange(category.title)} disabled={Boolean(selectedCategory)}>
          <span className="figma-category-visual">
            <span className="figma-category-image"><img src={category.image} alt="" /></span>
            <span className="figma-category-label">{(labels[categoryIndex] ?? "").split("\n").map((line) => <span key={line}>{line}<br /></span>)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function CollectorModeToggle({
  enabled,
  onChange,
  placement,
  label,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  placement: "menu" | "chip";
  label: string;
}): React.ReactElement {
  if (placement === "menu") {
    return (
      <DropdownMenu.CheckboxItem
        className="relative flex h-[24px] w-full flex-none cursor-pointer items-center gap-[12px] rounded-[6px] border-0 bg-transparent p-0 text-left text-[11px] font-medium leading-[normal] text-black outline-none [font-family:Inter,Arial,sans-serif] data-[highlighted]:outline-2 data-[highlighted]:outline-solid data-[highlighted]:outline-[#111] data-[highlighted]:outline-offset-[4px] hover:[&_span]:opacity-[0.58] hover:bg-[#f3f3f3] data-[state=checked]:bg-[#f3f3f3] data-[highlighted]:bg-[#f3f3f3] whitespace-nowrap"
        checked={enabled}
        onCheckedChange={(checked) => onChange(checked === true)}
      >
        <Icon icon={Sparkles} className="w-[14px] flex-none text-[#111]" size={16} />
        <span>{label}</span>
        <DropdownMenu.ItemIndicator className="absolute right-[5px] text-[#111]" aria-hidden="true"><Icon icon={Check} size={14} /></DropdownMenu.ItemIndicator>
      </DropdownMenu.CheckboxItem>
    );
  }

  return enabled ? (
    <button className="figma-collector-chip !flex !h-[29px] !items-center !gap-[7px] !rounded-[15px] !border !border-solid !border-[#e3e3e7] !bg-[#f8f8fa] !px-[10px] !text-[#242424] !shadow-[0_1px_2px_rgba(0,0,0,0.02)] !whitespace-nowrap hover:!bg-[#f0f0f2] max-[767px]:!max-w-[190px]" type="button" aria-label="Disable Collector Mode" title="Disable Collector Mode" onClick={() => onChange(false)}>
      <Icon icon={Sparkles} className="figma-collector-spark !w-[14px] !flex-none !text-[#111]" size={16} />
      <b className="!text-[11px] !font-semibold max-[767px]:!overflow-hidden max-[767px]:!text-ellipsis">{label}</b>
      <Icon icon={CircleHelp} className="figma-collector-info !text-[#777]" size={14} />
    </button>
  ) : <></>;
}

function ImageUploader({
  placement,
  selectedImage,
  onImageSelect,
  onImageClear,
  cameraInputRef,
  imageInputRef,
  fileInputRef,
  collectorMode,
  onCollectorModeChange,
  copy,
}: {
  placement: "preview" | "controls";
  selectedImage: SelectedImage;
  onImageSelect: InputStageProps["onImageSelect"];
  onImageClear: InputStageProps["onImageClear"];
  cameraInputRef: RefObject<HTMLInputElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  collectorMode: boolean;
  onCollectorModeChange: InputStageProps["onCollectorModeChange"];
  copy: typeof uiCopy[UiLocale];
}): React.ReactElement {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0] ?? null;
    onImageSelect(file);
  };

  if (placement === "preview") {
    return selectedImage ? (
      <div className="figma-upload-preview relative h-[57px] w-[58px] flex-none overflow-hidden rounded-[11px] border-[0.7px] border-solid border-[#ededed] bg-white">
        <img className="figma-upload-preview__image block h-full w-full object-cover" src={selectedImage.url} alt={selectedImage.name} />
        <button className="absolute top-[3px] right-[3px] grid h-[20px] w-[20px] place-items-center !cursor-pointer !rounded-full !border-0 !bg-white/90 !p-0 text-[#555] hover:!bg-white" type="button" aria-label="Remove uploaded image" onClick={onImageClear}>
          <Icon icon={X} size={14} />
        </button>
      </div>
    ) : <></>;
  }

  return (
    <>
      <div className="figma-upload-control">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="figma-composer-round-button" type="button" aria-label="Add attachment or mode"><Icon icon={Plus} /></button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-[80] box-border flex min-h-[166px] w-[174px] flex-col items-start justify-between gap-[13px] overflow-hidden rounded-[13px] border border-solid border-[#eeeef1] bg-white px-[13px] py-[12px] shadow-[0_4px_12px_3px_rgba(0,0,0,0.08)] max-[767px]:ml-[-12px] max-[767px]:w-[min(240px,_calc(100vw_-_28px))]"
              side="top"
              align="start"
              sideOffset={10}
              collisionPadding={8}
            >
              <DropdownMenu.Item className="flex h-[13px] w-full flex-none cursor-pointer items-center gap-[12px] rounded-[2px] border-0 bg-transparent p-0 text-left text-[11px] font-medium leading-[normal] text-black outline-none [font-family:Inter,Arial,sans-serif] data-[highlighted]:outline-2 data-[highlighted]:outline-solid data-[highlighted]:outline-[#111] data-[highlighted]:outline-offset-[4px] hover:[&_span]:opacity-[0.58] whitespace-nowrap" onSelect={() => cameraInputRef.current?.click()}>
                <Icon icon={Camera} className="block flex-none" size={16} />
                <span>{copy.takePhoto}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item className="flex h-[13px] w-full flex-none cursor-pointer items-center gap-[12px] rounded-[2px] border-0 bg-transparent p-0 text-left text-[11px] font-medium leading-[normal] text-black outline-none [font-family:Inter,Arial,sans-serif] data-[highlighted]:outline-2 data-[highlighted]:outline-solid data-[highlighted]:outline-[#111] data-[highlighted]:outline-offset-[4px] hover:[&_span]:opacity-[0.58] whitespace-nowrap" onSelect={() => imageInputRef.current?.click()}>
                <Icon icon={Image} className="mr-[1px] block flex-none" size={16} />
                <span>{copy.uploadImage}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item className="flex h-[13px] w-full flex-none cursor-pointer items-center gap-[18px] rounded-[2px] border-0 bg-transparent p-0 text-left text-[11px] font-medium leading-[normal] tracking-[-0.266px] text-black outline-none [font-family:Inter,Arial,sans-serif] data-[highlighted]:outline-2 data-[highlighted]:outline-solid data-[highlighted]:outline-[#111] data-[highlighted]:outline-offset-[4px] hover:[&_span]:opacity-[0.58] whitespace-nowrap" onSelect={() => fileInputRef.current?.click()}>
                <Icon icon={FileUp} className="block flex-none" size={16} />
                <span>{copy.uploadFile}</span>
              </DropdownMenu.Item>
              <CollectorModeToggle enabled={collectorMode} onChange={onCollectorModeChange} placement="menu" label={copy.collectorMode} />
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <input ref={cameraInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={handleFileChange} />
        <input ref={imageInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
        <input ref={fileInputRef} className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handleFileChange} />
      </div>
    </>
  );
}

function keepNativeTextDrag(event: React.DragEvent): void {
  // The composer-root dropzone preventDefaults every drag event; stop non-file
  // drags at the textarea so its native text drag-and-drop still works.
  if (!event.dataTransfer?.types.includes("Files")) event.stopPropagation();
}

function ProductInput(props: InputStageProps): React.ReactElement {
  const {
    locale,
    query,
    selectedCategory,
    selectedImage,
    collectorMode,
    clarificationRequested,
    creating,
    submitActive,
    speechSupported,
    speechListening,
    interimTranscript,
    onQueryChange,
    onCategoryChange,
    onImageSelect,
    onImageClear,
    onCollectorModeChange,
    onSpeechToggle,
    onSubmit,
  } = props;
  const copy = uiCopy[locale];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    noKeyboard: true,
    noDragEventsBubbling: true,
    onDrop: (files) => onImageSelect(files[0] ?? null),
  });

  const clearImage = (): void => {
    for (const input of [cameraInputRef.current, imageInputRef.current, fileInputRef.current]) {
      if (input) input.value = "";
    }
    onImageClear();
  };

  const updateQuery = (): void => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const maximumHeight = 75;
    textarea.style.height = "15px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maximumHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maximumHeight ? "auto" : "hidden";
    onQueryChange(textarea.value);
  };

  return (
    <>
      {clarificationRequested ? <div className="figma-clarification-bubble absolute top-[340px] left-1/2 flex min-h-[50px] w-[520px] items-start rounded-[14px] bg-[#f1f1f1] px-[13px] py-[10px] text-[#333] text-[12px] font-normal leading-[1.45] [transform:translateX(-50%)] [font-family:var(--font-geist-sans),_Geist,_Arial,sans-serif] animate-[figma-chat-enter_220ms_cubic-bezier(0.22,1,0.36,1)_both] max-[767px]:relative max-[767px]:inset-auto max-[767px]:w-full max-[767px]:min-h-0 max-[767px]:[transform:none]" role="status"><p className="m-0">{copy.clarification}</p></div> : null}
      <form {...getRootProps()} className={`figma-composer-box${selectedImage ? " has-image" : ""}${selectedCategory ? " has-category" : ""}${isDragActive ? " is-drop-active" : ""}`} onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ file: selectedImage?.file ?? null, text: query.trim(), category: selectedCategory, collectorMode });
      }}>
        <div className="figma-composer-content">
          <ImageUploader
            placement="preview"
            selectedImage={selectedImage}
            onImageSelect={onImageSelect}
            onImageClear={clearImage}
            cameraInputRef={cameraInputRef}
            imageInputRef={imageInputRef}
            fileInputRef={fileInputRef}
            collectorMode={collectorMode}
            onCollectorModeChange={onCollectorModeChange}
            copy={copy}
          />
          {selectedCategory ? <div className="figma-selected-category !flex !w-full !min-h-[15px] !items-center !justify-between !text-black !text-[13px] !font-medium !leading-[15px] !tracking-[-0.26px] ![font-family:var(--font-geist-sans),_Geist,_Arial,sans-serif] !animate-[figma-category-enter_220ms_cubic-bezier(0.22,1,0.36,1)_both]"><span>{selectedCategory}</span><button className="!grid !h-[20px] !w-[20px] !place-items-center !p-0 !border-0 !rounded-full !bg-transparent !text-[#8a8a8a] !cursor-pointer !transition-[background-color,color] !duration-[140ms] hover:!bg-[#f0f0f0] hover:!text-black focus-visible:!outline-2 focus-visible:!outline-solid focus-visible:!outline-[#111] focus-visible:!outline-offset-[2px]" type="button" aria-label="Remove category" onClick={() => onCategoryChange(null)}><Icon icon={X} size={14} /></button></div> : null}
          <textarea ref={textareaRef} rows={1} aria-label="Describe collectible" value={query} onInput={updateQuery} onChange={(event) => onQueryChange(event.target.value)} onDragOver={keepNativeTextDrag} onDrop={keepNativeTextDrag} placeholder={selectedCategory ? "" : copy.placeholder} />
          {speechListening ? <div className="figma-composer-speech-preview" aria-hidden="true"><i className="figma-composer-speech-preview__dot" />{interimTranscript ? <span>{interimTranscript}</span> : null}</div> : null}
        </div>
        <div className="figma-composer-actions">
          <div className="figma-composer-actions-left">
          <ImageUploader
            placement="controls"
            selectedImage={selectedImage}
            onImageSelect={onImageSelect}
            onImageClear={onImageClear}
            cameraInputRef={cameraInputRef}
            imageInputRef={imageInputRef}
            fileInputRef={fileInputRef}
            collectorMode={collectorMode}
            onCollectorModeChange={onCollectorModeChange}
            copy={copy}
          />
          {collectorMode ? <CollectorModeToggle enabled={collectorMode} onChange={onCollectorModeChange} placement="chip" label={copy.collectorMode} /> : null}
          </div>
          <div className="figma-composer-actions-right">
            {speechSupported ? <button className={`figma-composer-microphone${speechListening ? " is-listening" : ""}`} type="button" aria-label={speechListening ? copy.stopVoiceInput : copy.voiceInput} title={speechListening ? copy.stopVoiceInput : copy.voiceInput} onClick={onSpeechToggle}><Icon icon={Mic} size={16} /></button> : <span />}
            <button className={`figma-composer-round-button figma-composer-submit${submitActive ? " is-active text-white" : " text-[#777]"}`} type="submit" disabled={!submitActive || creating} aria-label="Submit"><Icon icon={ArrowUp} size={18} /></button>
          </div>
        </div>
        {isDragActive ? <div className="figma-composer-drop-hint" aria-hidden="true"><span>{copy.dropImage}</span></div> : null}
      </form>
    </>
  );
}

export function InputStage(props: InputStageProps): React.ReactElement {
  const copy = uiCopy[props.locale];
  return (
    <>
      <div className="figma-home-discovery">
        <header className="figma-home-heading"><h1 id="collectible-heading">{copy.heading}</h1><p>{copy.subheading}</p></header>
        <CategorySelector selectedCategory={props.selectedCategory} labels={copy.categories} onCategoryChange={props.onCategoryChange} />
      </div>
      <ProductInput {...props} />
    </>
  );
}
