import type { IntegrationStatus } from '@agent-recall/shared';
import { requestBlob } from '@/lib/api';
import { INTEGRATION_STATUS_LABEL, integrationTone } from '@/lib/queries';
import { Panel } from '@/components/ui/panel';
import { StatusDot } from '@/components/ui/status-dot';
import { AudioPlayer } from '@/components/ui/audio-player';
import { Cmd } from '@/components/ui/states';

const SAMPLE = 'Raise maxPoolSize to cover peak concurrency, set minPoolSize, and close every cursor. This procedure is verified by a recorded outcome.';

/** ElevenLabs section: status, voice, model, test voice, setup steps. */
export function VoiceSettings({ status }: { status?: IntegrationStatus }) {
  const connected = status?.status === 'connected';
  return (
    <Panel title="Audio (ElevenLabs)" meta={<span>optional</span>} actions={status && <StatusDot tone={integrationTone(status)} label={INTEGRATION_STATUS_LABEL[status.status]} />}>
      <div className="flex flex-col gap-3 text-dense">
        <p className="text-text-muted">Answers can be played or downloaded as audio. Text features never depend on it, and no audio is stored.</p>
        <dl className="grid grid-cols-[100px_1fr] gap-y-1.5">
          <dt className="text-text-muted">Voice</dt>
          <dd className="font-mono text-text">{String(status?.meta.voiceName ?? status?.meta.voiceId ?? '—')}</dd>
          <dt className="text-text-muted">Model</dt>
          <dd className="font-mono text-text">{String(status?.meta.modelId ?? '—')}</dd>
          <dt className="text-text-muted">Status</dt>
          <dd className="text-text">{status?.detail ?? '—'}</dd>
        </dl>
        <div className="flex items-center gap-3">
          <span className="text-text-muted">Test voice</span>
          <AudioPlayer
            generate={() => requestBlob('/api/audio/speech', { text: SAMPLE })}
            disabledReason={connected ? null : 'ElevenLabs is not connected. Follow the setup steps below.'}
            filename="agent-recall-voice-test.mp3"
          />
        </div>
        {!connected && (
          <ol className="list-decimal space-y-1 pl-5 text-caption font-normal text-text-muted">
            <li>
              Create an API key in ElevenLabs and set <Cmd>ELEVENLABS_API_KEY</Cmd> in <Cmd>.env</Cmd>.
            </li>
            <li>
              Pick a voice and set <Cmd>ELEVENLABS_VOICE_ID</Cmd>; optionally set <Cmd>ELEVENLABS_MODEL_ID</Cmd>.
            </li>
            <li>Restart the API, then press Refresh above.</li>
          </ol>
        )}
      </div>
    </Panel>
  );
}
