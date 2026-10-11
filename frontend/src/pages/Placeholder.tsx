import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader, Panel } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';

/** Temporary route body until the screen is built in its phase. */
export function Placeholder({ title, description, icon, message }: { title: string; description: string; icon: LucideIcon; message: ReactNode }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Panel>
        <EmptyState icon={icon} message={message} />
      </Panel>
    </>
  );
}
