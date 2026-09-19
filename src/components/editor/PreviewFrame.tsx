type PreviewFrameProps = { srcDoc?: string };
export default function PreviewFrame({ srcDoc = "" }: PreviewFrameProps) { return <iframe title="Live preview" className="min-h-[420px] w-full rounded-xl border bg-white" sandbox="allow-scripts" srcDoc={srcDoc} />; }
