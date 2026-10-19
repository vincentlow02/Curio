import { useId, useRef, useState } from "react";
import { SquarePen } from "lucide-react";
import type { AnalysisStage, CollectorEvidence } from "../../../core/analysis/types";
import { COLLECTIBLE_CATEGORIES, MAX_PRODUCT_TYPE_LENGTH, UNKNOWN_PRODUCT_TYPE, type CollectibleCategory, type DetectionResult, type PokemonCardIdentity } from "../../../core/profile/types";
import { Icon } from "../../../components/ui/icon";
import { uiCopy, type UiLocale } from "../locales";

type RecognitionStageProps = {
  recognition: DetectionResult;
  status: AnalysisStage;
  image: { name: string; url: string } | null;
  collectorEvidence: CollectorEvidence | null;
  researchStarting: boolean;
  locale: UiLocale;
  cardClass: string;
  onUpdateRecognized: <Key extends keyof DetectionResult>(key: Key, value: DetectionResult[Key]) => void;
  onUpdatePokemonCard: <Key extends keyof PokemonCardIdentity>(key: Key, value: PokemonCardIdentity[Key]) => void;
  onContinueResearch: () => void;
};

const recognitionDetailsClass = "!m-0 !flex !min-w-0 !flex-1 !flex-col !gap-[10px] !text-[12px] !leading-[normal] !tracking-[-0.24px] max-[767px]:!w-full";
const recognitionMainClass = "!flex !w-full !h-auto !flex-row !items-start !gap-[24px] !overflow-visible max-[767px]:!flex-col max-[767px]:!gap-[15px]";
const recognitionActionsClass = "!relative !flex !items-center !justify-end !gap-[10px] !mt-[18px] max-[391px]:!w-full";
const summaryLabelClass = "!m-0 !text-[11px] !font-normal !text-[#777]";
const summaryValueClass = "!m-0 !min-w-0 !text-[14px] !font-medium !leading-[19px] ![overflow-wrap:anywhere]";
const modalLabelClass = "flex min-w-0 flex-col gap-[6px] text-[12px] font-medium text-[#555]";
const modalFieldClass = "min-h-[42px] min-w-0 w-full rounded-[8px] border border-solid border-[#dedede] bg-white px-[11px] py-[9px] text-[14px] leading-[20px] text-[#222] outline-none focus:border-[#aaa] focus:ring-2 focus:ring-[#ededed]";

function copyIdentity(identity: DetectionResult): DetectionResult {
  return { ...identity, ...(identity.pokemonCard ? { pokemonCard: { ...identity.pokemonCard } } : {}) };
}

export function RecognitionStage({
  recognition,
  status,
  image,
  collectorEvidence,
  researchStarting,
  locale,
  cardClass,
  onUpdateRecognized,
  onUpdatePokemonCard,
  onContinueResearch,
}: RecognitionStageProps): React.ReactElement {
  const copy = uiCopy[locale];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const itemNameInputRef = useRef<HTMLTextAreaElement>(null);
  const dialogTitleId = useId();
  const [draft, setDraft] = useState<DetectionResult>(() => copyIdentity(recognition));
  const card = recognition.pokemonCard;
  const version = recognition.version.normalize("NFKC").trim().toLocaleLowerCase();
  const repeatedCardVersion = card && (version === "unknown" || [card.cardNumber, card.setCode, card.rarity, card.setName, card.edition]
    .some((value) => value.normalize("NFKC").trim().toLocaleLowerCase() === version));

  function openEditor(): void {
    setDraft(copyIdentity(recognition));
    dialogRef.current?.showModal();
    itemNameInputRef.current?.focus();
  }

  function updateDraft<Key extends keyof DetectionResult>(key: Key, value: DetectionResult[Key]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateDraftCard<Key extends keyof PokemonCardIdentity>(key: Key, value: PokemonCardIdentity[Key]): void {
    setDraft((current) => current.pokemonCard
      ? { ...current, pokemonCard: { ...current.pokemonCard, [key]: value } }
      : current);
  }

  function saveChanges(): void {
    if (draft.itemName !== recognition.itemName) onUpdateRecognized("itemName", draft.itemName);
    if (draft.productType !== recognition.productType) onUpdateRecognized("productType", draft.productType);
    if (draft.version !== recognition.version) onUpdateRecognized("version", draft.version);
    if (draft.category !== recognition.category) onUpdateRecognized("category", draft.category);
    if (draft.pokemonCard && recognition.pokemonCard) {
      const fields = ["cardNumber", "setCode", "rarity", "language", "gradingCompany"] as const;
      for (const field of fields) {
        if (draft.pokemonCard[field] !== recognition.pokemonCard[field]) onUpdatePokemonCard(field, draft.pokemonCard[field]);
      }
    }
    dialogRef.current?.close();
  }

  return (
    <article className={`figma-recognition-card ${cardClass}`}>
      <div className={`figma-recognition-main ${recognitionMainClass}`}>
        {image ? (
          <img className="figma-recognition-image !h-[147px] !w-[147px] !flex-none !rounded-[14px] !bg-[#d9d9d9] !object-cover max-[767px]:!h-[112px] max-[767px]:!w-[112px]" src={image.url} alt={image.name} />
        ) : (
          <div className="figma-recognition-image-placeholder !h-[147px] !w-[147px] !flex-none !rounded-[14px] !bg-[#d9d9d9] !object-cover max-[767px]:!h-[112px] max-[767px]:!w-[112px]" />
        )}
        <dl className={`figma-recognition-details ${recognitionDetailsClass}`}>
            <div className="!min-w-0"><dt className={summaryLabelClass}>{copy.fields.itemName}</dt><dd className="!m-0 !mt-[4px] !text-[18px] !font-semibold !leading-[24px] ![overflow-wrap:anywhere]">{recognition.itemName}</dd></div>
            <div className="!min-w-0"><dt className="sr-only">{copy.fields.productType}</dt><dd className="!m-0"><span className="!inline-flex !max-w-full !rounded-full !bg-[#f5f5f5] !px-[8px] !py-[3px] !text-[11px] !leading-[16px] !text-[#555] ![overflow-wrap:anywhere]">{recognition.productType ?? UNKNOWN_PRODUCT_TYPE}</span></dd></div>
            {card ? <div className="!grid !grid-cols-[repeat(2,minmax(0,1fr))] !gap-x-[14px] !gap-y-[9px] max-[480px]:!grid-cols-1">
              <div><dt className={summaryLabelClass}>{copy.fields.cardNumber}</dt><dd className={summaryValueClass}>{card.cardNumber}</dd></div>
              <div><dt className={summaryLabelClass}>{copy.fields.setCode}</dt><dd className={summaryValueClass}>{card.setCode}</dd></div>
              <div><dt className={summaryLabelClass}>{copy.fields.rarity}</dt><dd className={summaryValueClass}>{card.rarity}</dd></div>
              <div><dt className={summaryLabelClass}>{copy.fields.language}</dt><dd className={summaryValueClass}>{copy.languageValues[card.language]}</dd></div>
              <div><dt className={summaryLabelClass}>{copy.fields.grading}</dt><dd className={summaryValueClass}>{card.gradingCompany === "ungraded" ? copy.gradingValues.ungraded : card.gradingCompany === "unknown" ? copy.gradingValues.unknown : card.gradingCompany}</dd></div>
            </div> : null}
            {!repeatedCardVersion ? <div><dt className={summaryLabelClass}>{copy.fields.version}</dt><dd className={summaryValueClass}>{recognition.version}</dd></div> : null}
        </dl>
      </div>
      {collectorEvidence ? <div className="figma-collector-evidence-preview !my-0 !mr-[16px] !mb-[12px] !ml-[16px] !flex !items-center !justify-between !rounded-[8px] !bg-[#f5f5f5] !px-[12px] !py-[10px] !text-[11px] max-[767px]:!mt-[14px] max-[767px]:!mr-0 max-[767px]:!mb-0 max-[767px]:!ml-0 max-[767px]:!items-start max-[767px]:!gap-[8px] max-[767px]:!flex-col"><b>{copy.collectorEvidence}</b><span className="!text-[#777]">{copy.visibleSignals(collectorEvidence.editionSignals.length + collectorEvidence.conditionSignals.length + collectorEvidence.visibleIdentifiers.length, collectorEvidence.missingEvidence.length)}</span></div> : null}
      <div className={`figma-recognition-actions ${recognitionActionsClass}`}>
        <button ref={editButtonRef} className="figma-recognition-edit !h-[26px] !w-[60px] !rounded-[8px] !px-[9px] !py-[6px] !flex !items-center !gap-[7px] !border-[0.7px] !border-solid !border-[#d9d9d9] !bg-white !text-black !text-[12px] !font-normal !leading-[normal] !tracking-[-0.24px] !cursor-pointer hover:!opacity-[.72] max-[391px]:!w-auto max-[391px]:!flex-1 max-[391px]:!justify-center" type="button" aria-haspopup="dialog" disabled={status !== "identified" || researchStarting} onClick={openEditor}><Icon icon={SquarePen} size={14} /><span>{copy.edit}</span></button>
        <button className="figma-recognition-continue !h-[26px] !w-[118px] !rounded-[8px] !border-0 !border-none !pt-[4px] !pr-[8px] !pb-[6px] !pl-[9px] !bg-black !text-white !text-[12px] !font-normal !leading-[normal] !tracking-[-0.24px] !cursor-pointer hover:!opacity-[.72] disabled:!cursor-default disabled:!opacity-[.45] max-[391px]:!w-auto max-[391px]:!flex-1 max-[391px]:!justify-center" type="button" disabled={status !== "identified" || researchStarting} onClick={onContinueResearch}>{researchStarting ? copy.starting : copy.continueResearch}</button>
      </div>
      <dialog ref={dialogRef} className="figma-recognition-edit-dialog !m-auto !w-[560px] !max-w-[calc(100vw-24px)] !max-h-[calc(100dvh-32px)] !overflow-y-auto !rounded-[16px] !border !border-solid !border-[#e6e6e6] !bg-white !p-[22px] !text-[#222] !shadow-[0_24px_90px_#0002] max-[480px]:!p-[16px]" aria-labelledby={dialogTitleId} onClose={() => editButtonRef.current?.focus()}>
        <form onSubmit={(event) => { event.preventDefault(); saveChanges(); }}>
          <h2 id={dialogTitleId} className="!m-0 !mb-[18px] !text-[20px] !font-semibold !tracking-[-0.4px]">{copy.editItemDetails}</h2>
          <div className="!flex !flex-col !gap-[14px]">
            <label className={modalLabelClass}>{copy.fields.itemName}<textarea ref={itemNameInputRef} className={`${modalFieldClass} !min-h-[64px] !max-h-[120px] !resize-y ![field-sizing:content]`} rows={2} value={draft.itemName} onChange={(event) => updateDraft("itemName", event.target.value.replace(/[\r\n]+/g, " "))} /></label>
            <label className={modalLabelClass}>{copy.fields.productType}<input className={modalFieldClass} lang="ja" maxLength={MAX_PRODUCT_TYPE_LENGTH} value={draft.productType ?? UNKNOWN_PRODUCT_TYPE} onChange={(event) => updateDraft("productType", event.target.value)} /></label>
            {draft.pokemonCard ? <div className="!grid !grid-cols-[repeat(2,minmax(0,1fr))] !gap-[14px] max-[480px]:!grid-cols-1">
              <label className={modalLabelClass}>{copy.fields.cardNumber}<input className={modalFieldClass} value={draft.pokemonCard.cardNumber} onChange={(event) => updateDraftCard("cardNumber", event.target.value)} /></label>
              <label className={modalLabelClass}>{copy.fields.setCode}<input className={modalFieldClass} value={draft.pokemonCard.setCode} onChange={(event) => updateDraftCard("setCode", event.target.value)} /></label>
              <label className={modalLabelClass}>{copy.fields.rarity}<input className={modalFieldClass} value={draft.pokemonCard.rarity} onChange={(event) => updateDraftCard("rarity", event.target.value)} /></label>
              <label className={modalLabelClass}>{copy.fields.language}<select className={modalFieldClass} value={draft.pokemonCard.language} onChange={(event) => updateDraftCard("language", event.target.value as PokemonCardIdentity["language"])}><option value="Japanese">{copy.languageValues.Japanese}</option><option value="English">{copy.languageValues.English}</option><option value="unknown">{copy.languageValues.unknown}</option></select></label>
              <label className={modalLabelClass}>{copy.fields.grading}<select className={modalFieldClass} value={draft.pokemonCard.gradingCompany} onChange={(event) => updateDraftCard("gradingCompany", event.target.value as PokemonCardIdentity["gradingCompany"])}><option value="ungraded">{copy.gradingValues.ungraded}</option><option value="PSA">PSA</option><option value="BGS">BGS</option><option value="CGC">CGC</option><option value="unknown">{copy.gradingValues.unknown}</option></select></label>
            </div> : <label className={modalLabelClass}>{copy.fields.version}<input className={modalFieldClass} value={draft.version} onChange={(event) => updateDraft("version", event.target.value)} /></label>}
            <details className="!rounded-[9px] !border !border-solid !border-[#ececec] !px-[12px] !py-[10px]"><summary className="!cursor-pointer !text-[13px] !font-medium !text-[#555] focus-visible:!outline-2 focus-visible:!outline-[#e98470]">{copy.advancedDetails}</summary><div className="!flex !flex-col !gap-[14px] !pt-[14px]">
              {draft.pokemonCard ? <label className={modalLabelClass}>{copy.fields.version}<input className={modalFieldClass} value={draft.version} onChange={(event) => updateDraft("version", event.target.value)} /></label> : null}
              <label className={modalLabelClass}>{copy.fields.category}<select className={modalFieldClass} value={draft.category} onChange={(event) => updateDraft("category", event.target.value as CollectibleCategory)}>{COLLECTIBLE_CATEGORIES.map((category, index) => <option value={category} key={category}>{(copy.categories[index] ?? category).replace("\n", " ")}</option>)}</select></label>
            </div></details>
          </div>
          <div className="!mt-[22px] !flex !justify-end !gap-[10px] max-[480px]:!flex-col-reverse"><button className="!min-h-[42px] !rounded-[8px] !border !border-solid !border-[#dedede] !bg-white !px-[16px] !text-[13px] !font-medium !text-[#444] !cursor-pointer focus-visible:!outline-2 focus-visible:!outline-[#e98470]" type="button" onClick={() => dialogRef.current?.close()}>{copy.cancel}</button><button className="!min-h-[42px] !rounded-[8px] !border-0 !bg-black !px-[16px] !text-[13px] !font-medium !text-white !cursor-pointer focus-visible:!outline-2 focus-visible:!outline-[#e98470]" type="submit">{copy.saveChanges}</button></div>
        </form>
      </dialog>
    </article>
  );
}
