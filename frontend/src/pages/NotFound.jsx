import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui/States';

export default function NotFound() {
  return (
    <EmptyState icon={Compass} title="Page not found" action={<Link to="/" className="text-sm font-medium text-primary hover:underline">Go to the start page</Link>}>
      The link may be old, or the record may belong to another pharmacy.
    </EmptyState>
  );
}
