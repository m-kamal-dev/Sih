// Re-mounts on every navigation, so each page enters with a short fade-and-rise.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="eg-page">{children}</div>;
}
