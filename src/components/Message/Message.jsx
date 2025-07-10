export default function Message({ text, className = "" }) {
  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {text}
    </div>
  );
}
