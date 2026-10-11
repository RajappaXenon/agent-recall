import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      message="This page does not exist."
      action={
        <Button asChild size="sm" variant="primary">
          <Link to="/">Go to overview</Link>
        </Button>
      }
      className="py-24"
    />
  );
}
