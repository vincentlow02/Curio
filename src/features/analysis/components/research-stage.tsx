import type { AnalysisStage } from "../../../core/analysis/types";
import { uiCopy, type UiLocale } from "../locales";

type ResearchStageProps = {
  status: AnalysisStage;
  message: string;
  locale: UiLocale;
  collectorMode: boolean;
};

const researchSteps = ["searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices"] as const;
const researchOrder: AnalysisStage[] = ["queued_research", "searching_marketplaces", "searching_auctions", "searching_fallback", "processing_prices", "completed"];

const researchProgressClass = "!w-[680px] !ml-[34px] !px-0 !pt-[18px] !pb-[8px] !text-[#181818] !text-[13px] !font-normal !leading-[1.45] [font-family:var(--font-geist-sans),_Geist,_Arial,sans-serif] max-[767px]:!w-full max-[767px]:!max-w-none max-[767px]:!ml-0 max-[767px]:!pt-[8px]";
const researchHeadingClass = "flex items-start gap-[12px]";
const researchSpinnerClass = "h-[17px] w-[17px] flex-none mt-[1px] border-2 border-solid border-[#dedede] border-t-[#111] rounded-full";
const researchHeadingTitleClass = "block text-[14px] font-semibold";
const researchHeadingDescriptionClass = "mt-[3px] mb-0 text-[12px] text-[#777]";
const researchStepsClass = "mt-[17px] mb-0 ml-[8px] border-l border-solid border-[#e3e3e3] border-y-0 border-r-0 pl-[8px] pr-0 pt-0 pb-0 list-none";
const researchStepClass = "flex min-h-[32px] items-start gap-[10px] text-[#a0a0a0]";
const researchStepMarkerClass = "grid h-[14px] w-[14px] place-items-center ml-[-15.5px] border border-solid border-[#d7d7d7] rounded-full bg-[#fcfcfc] text-white text-[9px] leading-[1]";
const researchStepTextClass = "mt-[-2px] mb-0";

function stageIndex(status: AnalysisStage): number {
  const index = researchOrder.indexOf(status);
  return index < 0 ? 0 : index;
}

function ResearchStatusMessage({ message, locale }: Pick<ResearchStageProps, "message" | "locale">): React.ReactElement {
  return (
    <div className={researchHeadingClass}>
      <span className={researchSpinnerClass} />
      <div>
        <strong className={researchHeadingTitleClass}>{message}</strong>
        <p className={researchHeadingDescriptionClass}>{uiCopy[locale].liveSourcesDetail}</p>
      </div>
    </div>
  );
}

function ResearchSourceStatus({ status, locale, collectorMode }: Pick<ResearchStageProps, "status" | "locale" | "collectorMode">): React.ReactElement {
  const steps = uiCopy[locale].researchSteps;
  const current = stageIndex(status);

  return (
    <ol className={researchStepsClass}>
      {researchSteps.filter((step) => collectorMode || step !== "searching_auctions").map((step) => {
        const stepPosition = stageIndex(step);
        const state = current > stepPosition ? "complete" : current === stepPosition ? "active" : "pending";
        return (
          <li className={`${state} ${researchStepClass}`} key={step}>
            <span className={researchStepMarkerClass}>{state === "complete" ? "✓" : ""}</span>
            <p className={researchStepTextClass}>{steps[step]}</p>
          </li>
        );
      })}
    </ol>
  );
}

function ResearchProgress({ status, message, locale, collectorMode }: ResearchStageProps): React.ReactElement {
  return (
    <section className={`figma-agent-process ${researchProgressClass}`}>
      <ResearchStatusMessage message={message} locale={locale} />
      <ResearchSourceStatus status={status} locale={locale} collectorMode={collectorMode} />
    </section>
  );
}

export function ResearchStage(props: ResearchStageProps): React.ReactElement {
  return <ResearchProgress {...props} />;
}
