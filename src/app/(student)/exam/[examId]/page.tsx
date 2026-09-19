import CodeEditor from "@/components/editor/CodeEditor";
import ConsolePanel from "@/components/editor/ConsolePanel";
import PreviewFrame from "@/components/editor/PreviewFrame";
import ExamTimer from "@/components/exam/ExamTimer";
import QuestionPanel from "@/components/exam/QuestionPanel";
import TestResults from "@/components/exam/TestResults";
import TabSwitchModal from "@/components/proctor/TabSwitchModal";

export default function ExamPage() {
  return <main className="min-h-screen p-6"><header className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-semibold">Coding Exam</h1><ExamTimer /></header><div className="grid gap-4 lg:grid-cols-[280px_1fr]"><QuestionPanel /><section className="grid gap-4 xl:grid-cols-2"><CodeEditor /><PreviewFrame /><ConsolePanel /><TestResults /></section></div><TabSwitchModal open={false} onClose={() => undefined} /><p className="mt-4 text-sm text-slate-500">TODO: Load the exam by the dynamic examId and wire run/submit/proctor APIs.</p></main>;
}
