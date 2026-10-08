import { useRef } from "react";
import type { AnalysisStage, CollectorEvidence } from "../../../core/analysis/types";
import { COLLECTIBLE_CATEGORIES, type CollectibleCategory, type DetectionResult, type PokemonCardIdentity } from "../../../core/profile/types";
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

const recognitionDetailLabelClass = "!m-0 !font-normal";
const recognitionDetailValueClass = "!m-0 !w-[172px] !text-[13px] !font-medium !tracking-[-0.26px] ![overflow-wrap:anywhere] max-[767px]:!w-full max-[767px]:!min-w-0";
const recognitionDetailsClass = "!m-0 !flex !w-[361px] !flex-col !gap-[13px] !text-[12px] !leading-[normal] !tracking-[-0.24px] max-[767px]:!w-full max-[767px]:!gap-[12px]";
const recognitionDetailRowClass = "!grid !grid-cols-[125px_1fr] !gap-x-[64px] !items-start max-[767px]:!grid-cols-[105px_minmax(0,1fr)] max-[767px]:!gap-x-[10px] max-[391px]:!grid-cols-1 max-[391px]:!gap-y-[5px]";
const recognitionFieldClass = "!block !h-[25px] !w-[172px] !my-[-5px] !px-[7px] !py-[4px] !border !border-solid !border-transparent !rounded-[6px] !outline-none !appearance-none !bg-transparent !text-black !font-medium !text-[13px] !leading-[15px] !tracking-[-0.26px] !text-ellipsis !transition-[border-color,background-color,box-shadow] !duration-[140ms] !ease-[ease] hover:!border-[#d9d9d9] hover:!bg-white focus:!border-[#b8b8b8] focus:!bg-white focus:!shadow-[0_0_0_2px_rgba(0,0,0,0.05)] disabled:!cursor-default disabled:!opacity-100 disabled:![-webkit-text-fill-color:#000] disabled:hover:!border-transparent disabled:hover:!bg-transparent max-[767px]:!w-full max-[767px]:!min-w-0 max-[391px]:!h-[32px] max-[391px]:!my-0 max-[391px]:!border-[#e4e4e4] max-[391px]:!bg-white";
const recognitionMainClass = "!flex !w-[554px] !h-[171px] !flex-row !items-center !gap-[46px] !overflow-hidden max-[767px]:!w-full max-[767px]:!h-auto max-[767px]:!flex-col max-[767px]:!items-start max-[767px]:!gap-[15px] max-[767px]:!overflow-visible";
const recognitionActionsClass = "!absolute !right-[20px] !bottom-[15px] !flex !items-center !gap-[10px] max-[767px]:!relative max-[767px]:!inset-auto max-[767px]:!mt-[18px] max-[767px]:!justify-end max-[391px]:!w-full";
const recognitionSelectClass = `${recognitionFieldClass} !cursor-pointer`;

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
  const itemNameInputRef = useRef<HTMLInputElement>(null);

  return (
    <article className={`figma-recognition-card ${cardClass}`}>
      <div className={`figma-recognition-main ${recognitionMainClass}`}>
        {image ? (
          <img className="figma-recognition-image !h-[147px] !w-[147px] !flex-none !rounded-[14px] !bg-[#d9d9d9] !object-cover max-[767px]:!h-[112px] max-[767px]:!w-[112px]" src={image.url} alt={image.name} />
        ) : (
          <div className="figma-recognition-image-placeholder !h-[147px] !w-[147px] !flex-none !rounded-[14px] !bg-[#d9d9d9] !object-cover max-[767px]:!h-[112px] max-[767px]:!w-[112px]" />
        )}
        <dl className={`figma-recognition-details ${recognitionDetailsClass}`}>
          <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.itemName}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} ref={itemNameInputRef} aria-label={copy.fields.itemName} disabled={status !== "identified"} value={recognition.itemName} onChange={(event) => onUpdateRecognized("itemName", event.target.value)} /></dd></div>
          <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.version}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} aria-label={copy.fields.version} disabled={status !== "identified"} value={recognition.version} onChange={(event) => onUpdateRecognized("version", event.target.value)} /></dd></div>
          {recognition.pokemonCard ? <>
            <div className={`figma-pokemon-match-mode ${recognitionDetailRowClass}`}><dt className={recognitionDetailLabelClass}>{copy.fields.matchMode}：</dt><dd className={`${recognitionDetailValueClass} !text-[#286246] !font-semibold`}>{copy.exactPokemonCard}</dd></div>
            <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.cardNumber}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} aria-label={copy.fields.cardNumber} disabled={status !== "identified"} value={recognition.pokemonCard.cardNumber} onChange={(event) => onUpdatePokemonCard("cardNumber", event.target.value)} /></dd></div>
            <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.setCode}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} aria-label={copy.fields.setCode} disabled={status !== "identified"} value={recognition.pokemonCard.setCode} onChange={(event) => onUpdatePokemonCard("setCode", event.target.value)} /></dd></div>
            <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.rarity}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} aria-label={copy.fields.rarity} disabled={status !== "identified"} value={recognition.pokemonCard.rarity} onChange={(event) => onUpdatePokemonCard("rarity", event.target.value)} /></dd></div>
            <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.language}：</dt><dd className={recognitionDetailValueClass}><select className={recognitionSelectClass} aria-label={copy.fields.language} disabled={status !== "identified"} value={recognition.pokemonCard.language} onChange={(event) => onUpdatePokemonCard("language", event.target.value as PokemonCardIdentity["language"])}><option value="Japanese">{copy.languageValues.Japanese}</option><option value="English">{copy.languageValues.English}</option><option value="unknown">{copy.languageValues.unknown}</option></select></dd></div>
            <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.grading}：</dt><dd className={recognitionDetailValueClass}><select className={recognitionSelectClass} aria-label={copy.fields.grading} disabled={status !== "identified"} value={recognition.pokemonCard.gradingCompany} onChange={(event) => onUpdatePokemonCard("gradingCompany", event.target.value as PokemonCardIdentity["gradingCompany"])}><option value="ungraded">{copy.gradingValues.ungraded}</option><option value="PSA">PSA</option><option value="BGS">BGS</option><option value="CGC">CGC</option><option value="unknown">{copy.gradingValues.unknown}</option></select></dd></div>
          </> : null}
          <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.category}：</dt><dd className={recognitionDetailValueClass}><select className={recognitionSelectClass} aria-label={copy.fields.category} disabled={status !== "identified"} value={recognition.category} onChange={(event) => onUpdateRecognized("category", event.target.value as CollectibleCategory)}>{COLLECTIBLE_CATEGORIES.map((category, index) => <option value={category} key={category}>{(copy.categories[index] ?? category).replace("\n", " ")}</option>)}</select></dd></div>
          <div className={recognitionDetailRowClass}><dt className={recognitionDetailLabelClass}>{copy.fields.priceKeyword}：</dt><dd className={recognitionDetailValueClass}><input className={recognitionFieldClass} lang="ja" aria-label={copy.fields.priceKeyword} disabled={status !== "identified"} value={recognition.priceSearchKeywordJa} onChange={(event) => onUpdateRecognized("priceSearchKeywordJa", event.target.value)} /></dd></div>
        </dl>
      </div>
      {collectorEvidence ? <div className="figma-collector-evidence-preview !my-0 !mr-[16px] !mb-[12px] !ml-[16px] !flex !items-center !justify-between !rounded-[8px] !bg-[#f5f5f5] !px-[12px] !py-[10px] !text-[11px] max-[767px]:!mt-[14px] max-[767px]:!mr-0 max-[767px]:!mb-0 max-[767px]:!ml-0 max-[767px]:!items-start max-[767px]:!gap-[8px] max-[767px]:!flex-col"><b>{copy.collectorEvidence}</b><span className="!text-[#777]">{copy.visibleSignals(collectorEvidence.editionSignals.length + collectorEvidence.conditionSignals.length + collectorEvidence.visibleIdentifiers.length, collectorEvidence.missingEvidence.length)}</span></div> : null}
      <div className={`figma-recognition-actions ${recognitionActionsClass}`}>
        <button className="figma-recognition-edit !h-[26px] !w-[60px] !rounded-[8px] !px-[9px] !py-[6px] !flex !items-center !gap-[7px] !border-[0.7px] !border-solid !border-[#d9d9d9] !bg-white !text-black !text-[12px] !font-normal !leading-[normal] !tracking-[-0.24px] !cursor-pointer hover:!opacity-[.72] max-[391px]:!w-auto max-[391px]:!flex-1 max-[391px]:!justify-center" type="button" disabled={status !== "identified" || researchStarting} onClick={() => itemNameInputRef.current?.focus()}><img className="!block !h-[9px] !w-[9px]" src="/figma/toolbar-edit.svg" alt="" /><span>{copy.edit}</span></button>
        <button className="figma-recognition-continue !h-[26px] !w-[118px] !rounded-[8px] !border-0 !border-none !pt-[4px] !pr-[8px] !pb-[6px] !pl-[9px] !bg-black !text-white !text-[12px] !font-normal !leading-[normal] !tracking-[-0.24px] !cursor-pointer hover:!opacity-[.72] disabled:!cursor-default disabled:!opacity-[.45] max-[391px]:!w-auto max-[391px]:!flex-1 max-[391px]:!justify-center" type="button" disabled={status !== "identified" || researchStarting} onClick={onContinueResearch}>{researchStarting ? copy.starting : copy.continueResearch}</button>
      </div>
    </article>
  );
}
