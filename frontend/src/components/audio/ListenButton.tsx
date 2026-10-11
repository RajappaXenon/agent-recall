import { requestBlob } from '@/lib/api';
import { useIntegrations } from '@/lib/queries';
import { AudioPlayer } from '@/components/ui/audio-player';

const MAX = 2500;
const clean = (t: string) => t.replace(/\s*\[mem:[a-f0-9]{24}\]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX);

/** Listen / Export audio for any text. Disabled with the reason unless ElevenLabs is connected. */
export function ListenButton({ text, filename, className }: { text: string; filename?: string; className?: string }) {
  const integrations = useIntegrations();
  const eleven = integrations.data?.integrations.find((i) => i.key === 'elevenlabs');
  const reason =
    eleven?.status === 'connected'
      ? null
      : eleven?.status === 'not_configured'
        ? 'ElevenLabs is not configured. See Settings to add a key.'
        : eleven
          ? `Audio unavailable: ${eleven.detail}`
          : 'Checking audio availability…';
  return <AudioPlayer key={clean(text)} generate={() => requestBlob('/api/audio/speech', { text: clean(text) })} disabledReason={reason} filename={filename} className={className} />;
}
