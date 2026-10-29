import { ApplyFlow } from '@/components/features/ApplyFlow';

export default function ApplyPage() {
  return (
    <div>
      <header className="eg-page-head">
        <div className="eg-eyebrow">For institutions</div>
        <h1>Check an application before you submit</h1>
        <p>Enter your details, add your documents, and see what the reviewing officer will see: missing items, documents worth a second look, and how to fix them. Files are processed in memory and not stored.</p>
      </header>
      <ApplyFlow />
    </div>
  );
}
