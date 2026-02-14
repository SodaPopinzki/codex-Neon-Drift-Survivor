type OverlayProps = {
  title: string;
  subtitle: string;
};

export function Overlay({ title, subtitle }: OverlayProps) {
  return (
    <div className="overlay">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}
