import { useSession } from '../../context/SessionContext';
import { Forbidden } from '../ui/States';

/** Route guard for the UI. The database rejects the same actions independently. */
export function RequirePermission({ permission, what, children }) {
  const { can } = useSession();
  if (!can(permission)) return <Forbidden what={what} />;
  return children;
}
