import { LiveDocumentCheck } from '@/components/features/LiveDocumentCheck';

export default function AnalyzePage() {
  return (
    <div>
      <header className="eg-page-head">
        <div className="eg-eyebrow">Live check</div>
        <h1>Check a document</h1>
        <p>
          Upload any PDF. Separate checks look for edits after signing, hidden text and expired dates, and an AI reads what the document says. Everything found is a signal worth checking. A person decides.
        </p>
      </header>
      <LiveDocumentCheck />
    </div>
  );
}
