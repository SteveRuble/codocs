export default function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="alert alert-error">
      <span>{message}</span>
    </div>
  );
}
