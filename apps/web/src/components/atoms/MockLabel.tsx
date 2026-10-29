interface MockLabelProps {
  className?: string;
}

export function MockLabel({ className }: MockLabelProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-validity)',
        border: '1px dashed var(--color-validity)',
        borderRadius: 3,
        letterSpacing: '0.05em',
      }}
    >
      MOCK
    </span>
  );
}
