import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="empty">
      <p>Not found.</p>
      <p>
        <Link to="/">Back to runs</Link>
      </p>
    </div>
  );
}
