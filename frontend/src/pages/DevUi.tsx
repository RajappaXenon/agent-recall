import * as React from 'react';
import { Bot, CheckCircle2, CircleDot, Database, Inbox, Play, Plus, RotateCcw, Server, Trash2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { MEMORY_TYPES, type MemoryType } from '@agent-recall/shared';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge, DemoDataBadge, EngineBadge, MemoryTypeBadge, VerificationBadge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import { ScoreBar } from '@/components/ui/score-bar';
import { LatencyChip } from '@/components/ui/latency-chip';
import { PageHeader, Panel } from '@/components/ui/panel';
import { MetricTile } from '@/components/ui/metric-tile';
import { ResultRow } from '@/components/ui/result-row';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog, DialogClose, DialogContent, DialogTrigger, Drawer } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { MetricTileSkeleton, ResultRowSkeleton, TableRowsSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Timeline } from '@/components/ui/timeline';
import { AudioPlayer } from '@/components/ui/audio-player';
import { Switch } from '@/components/ui/switch';
import { axisProps, ChartTooltip, gridProps } from '@/components/charts/chart-kit';
import { MODE_META, TYPE_META, tokenColor, type SearchMode } from '@/lib/tokens';

/*
 * Component gallery for design review. Values here are illustrative fixtures
 * for this page only (it is not a data screen and is not linked from the app).
 */

const SWATCHES = [
  ['bg', '--bg'],
  ['sidebar', '--sidebar'],
  ['surface', '--surface'],
  ['surface-raised', '--surface-raised'],
  ['surface-overlay', '--surface-overlay'],
  ['border', '--border'],
  ['border-strong', '--border-strong'],
  ['text', '--text'],
  ['text-muted', '--text-muted'],
  ['text-faint', '--text-faint'],
  ['accent', '--accent'],
  ['accent-2', '--accent-2'],
  ['keyword', '--keyword'],
  ['success', '--success'],
  ['warning', '--warning'],
  ['danger', '--danger'],
] as const;

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-section text-text">
        {title}
      </h2>
      {children}
    </section>
  );
}

interface FixtureRow {
  id: string;
  title: string;
  type: MemoryType;
  retrievals: number;
  updated: string;
}
const FIXTURE_ROWS: FixtureRow[] = [
  { id: 'a', title: 'Raise maxPoolSize and close cursors', type: 'procedural', retrievals: 14, updated: 'Oct 9' },
  { id: 'b', title: 'API timeouts after pool change', type: 'episodic', retrievals: 9, updated: 'Oct 8' },
  { id: 'c', title: 'waitQueueTimeoutMS meaning', type: 'semantic', retrievals: 6, updated: 'Oct 7' },
  { id: 'd', title: 'Connection errors → taxonomy', type: 'taxonomic', retrievals: 2, updated: 'Oct 2' },
];

const CHART_FIXTURE = [
  { d: 'Mon', created: 3, retrieved: 8 },
  { d: 'Tue', created: 5, retrieved: 11 },
  { d: 'Wed', created: 2, retrieved: 7 },
  { d: 'Thu', created: 6, retrieved: 15 },
  { d: 'Fri', created: 4, retrieved: 12 },
];

export default function DevUi() {
  const [mode, setMode] = React.useState<SearchMode>('hybrid');
  const [sel, setSel] = React.useState<string | undefined>('procedural');
  const [combo, setCombo] = React.useState<string | undefined>();
  const [policy, setPolicy] = React.useState(true);
  const [drawer, setDrawer] = React.useState(false);
  const [checked, setChecked] = React.useState<Record<string, boolean>>({ r1: true });
  const [hover, setHover] = React.useState<string | null>(null);

  const columns: Column<FixtureRow>[] = [
    {
      key: 'title',
      header: 'Title',
      cell: (r) => (
        <span className="flex items-center gap-2">
          <MemoryTypeBadge type={r.type} compact />
          <span className="truncate">{r.title}</span>
        </span>
      ),
      sortValue: (r) => r.title,
    },
    { key: 'type', header: 'Type', cell: (r) => TYPE_META[r.type].label, sortValue: (r) => r.type },
    { key: 'retrievals', header: 'Retrievals', cell: (r) => r.retrievals, sortValue: (r) => r.retrievals, align: 'right' },
    { key: 'updated', header: 'Updated', cell: (r) => <span className="text-text-muted">{r.updated}</span> },
  ];

  return (
    <div className="flex flex-col gap-10 pb-16">
      <PageHeader
        title="Design system"
        description="Every component in its states, built from the tokens in tokens.css. Used for screenshot review; not part of the product navigation."
      />

      <Section title="Tokens" id="tokens">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {SWATCHES.map(([name, v]) => (
            <div key={name} className="flex flex-col gap-1.5">
              <div className="h-10 rounded-control border border-border-strong" style={{ background: `rgb(var(${v}))` }} />
              <span className="font-mono text-caption text-text-muted">{v}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {(Object.keys(MODE_META) as SearchMode[]).map((m) => (
            <span key={m} className={`flex items-center gap-2 text-dense ${MODE_META[m].text}`}>
              <span className={`size-2.5 rounded-full ${MODE_META[m].bg}`} aria-hidden />
              {MODE_META[m].label} mode
            </span>
          ))}
          {MEMORY_TYPES.map((t) => (
            <MemoryTypeBadge key={t} type={t} />
          ))}
        </div>
        <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
          <span className="text-title">Page title 22/28/600</span>
          <span className="text-section">Section title 15/22/600</span>
          <span className="text-body">Body 14/20/400 — The quick memory retrieves the verified procedure.</span>
          <span className="text-dense">Dense row 13/18/400 — Pool timeout after maxPoolSize change</span>
          <span className="text-caption text-text-muted">Caption 12/16/500</span>
          <span className="font-mono text-dense text-text-muted">Geist Mono — 6528f0c2e4b0a1d2c3f4a5b6 · ECONNRESET</span>
        </div>
      </Section>

      <Section title="Buttons" id="buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">
            <Play aria-hidden />
            Run all
          </Button>
          <Button variant="secondary">
            <Plus aria-hidden />
            Create memory
          </Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">
            <Trash2 aria-hidden />
            Archive memory
          </Button>
          <Button variant="primary" loading>
            Recording outcome
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <Button size="sm" variant="primary">
            Small primary
          </Button>
          <Button size="sm">Small secondary</Button>
          <Button size="icon" variant="ghost" aria-label="Reset">
            <RotateCcw aria-hidden />
          </Button>
        </div>
      </Section>

      <Section title="Inputs" id="inputs">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Title" htmlFor="dev-title" hint="Shown in search results.">
            <Input id="dev-title" placeholder="e.g. Pool timeout after deploy" />
          </Field>
          <Field label="Invalid" htmlFor="dev-invalid" error="Title is required.">
            <Input id="dev-invalid" aria-invalid="true" />
          </Field>
          <Field label="Type" htmlFor="dev-select">
            <Select
              id="dev-select"
              value={sel}
              onValueChange={setSel}
              options={MEMORY_TYPES.map((t) => {
                const Icon = TYPE_META[t].icon;
                return { value: t, label: TYPE_META[t].label, icon: <Icon className={`size-3.5 ${TYPE_META[t].text}`} aria-hidden /> };
              })}
            />
          </Field>
          <Field label="Agent" htmlFor="dev-combo">
            <Combobox
              id="dev-combo"
              value={combo}
              onValueChange={setCombo}
              placeholder="Any agent"
              options={['Research Agent', 'Engineering Assistant', 'Operations Analyst'].map((a) => ({
                value: a,
                label: a,
                icon: <Bot className="size-3.5 text-text-muted" aria-hidden />,
              }))}
            />
          </Field>
          <Field label="Content" htmlFor="dev-textarea" className="md:col-span-2">
            <Textarea id="dev-textarea" placeholder="What happened, what fixed it, and how you know." />
          </Field>
          <div className="flex flex-col gap-3">
            <span className="text-caption text-text-muted">Segmented control</span>
            <SegmentedControl
              aria-label="Search mode"
              value={mode}
              onValueChange={setMode}
              options={(Object.keys(MODE_META) as SearchMode[]).map((m) => ({
                value: m,
                label: MODE_META[m].label,
                activeClass: MODE_META[m].text,
              }))}
            />
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-caption text-text-muted">Switch</span>
            <label className="flex items-center gap-2 text-dense text-text">
              <Switch checked={policy} onCheckedChange={setPolicy} />
              Outcome policy {policy ? 'on' : 'off'}
            </label>
          </div>
        </div>
      </Section>

      <Section title="Tabs" id="tabs">
        <Tabs defaultValue="content">
          <TabsList>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="provenance">Provenance</TabsTrigger>
            <TabsTrigger value="related">Related</TabsTrigger>
            <TabsTrigger value="retrievals">Retrievals</TabsTrigger>
            <TabsTrigger value="embedding">Embedding</TabsTrigger>
          </TabsList>
          <TabsContent value="content" className="text-body text-text-muted">
            Tab panels animate nothing; the active tab gets an accent underline.
          </TabsContent>
          <TabsContent value="provenance" className="text-body text-text-muted">
            Provenance panel.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Badges, status, scores" id="badges">
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge status="verified_success" />
          <VerificationBadge status="verified_failure" />
          <VerificationBadge status="unverified" />
          <EngineBadge engine="atlas_search" />
          <EngineBadge engine="atlas_vector_search" />
          <EngineBadge engine="rrf" />
          <EngineBadge engine="fallback_regex" />
          <EngineBadge engine="unavailable" />
          <DemoDataBadge />
          <Badge tone="accent">Selected (2)</Badge>
          <Badge tone="keyword">K3</Badge>
          <Badge tone="semantic">S3</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <StatusDot tone="success" label="Connected" />
          <StatusDot tone="warning" label="Index building" pulse />
          <StatusDot tone="danger" label="Error" />
          <StatusDot tone="neutral" label="Not configured" />
          <LatencyChip ms={38} label="keyword" />
          <LatencyChip ms={null} label="vector" />
        </div>
        <div className="grid max-w-md gap-2">
          <ScoreBar value={7.31} max={7.31} colorClass="bg-mode-keyword" />
          <ScoreBar value={0.842} max={0.91} colorClass="bg-mode-semantic" />
          <ScoreBar value={0.0323} max={0.0371} colorClass="bg-mode-hybrid" />
        </div>
      </Section>

      <Section title="Panels and metric tiles" id="panels">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Total memories" value="27" context="25 seeded · 2 live" spark={[18, 20, 21, 25, 27]} badge={<DemoDataBadge />} />
          <MetricTile label="Indexed" value="27" context="of 27 have a current embedding" sparkToken="accent-2" spark={[10, 15, 22, 27, 27]} />
          <MetricTile label="Successful outcomes" value="3" context="of 4 recorded" sparkToken="success" spark={[0, 1, 1, 2, 3]} />
          <MetricTile label="Retrieval success rate" value={null} context="No outcomes recorded yet" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            title="Keyword"
            className="lg:col-span-2"
            meta={
              <>
                <EngineBadge engine="atlas_search" />
                <LatencyChip ms={38} />
              </>
            }
            actions={
              <Button size="sm" variant="ghost">
                Run
              </Button>
            }
            flush
          >
            {(['r1', 'r2', 'r3'] as const).map((id, i) => (
              <ResultRow
                key={id}
                rank={i + 1}
                title={['Pool timeout error text', 'Thread pool exhaustion in ML worker', 'Pool fix procedure'][i]!}
                type={(['semantic', 'episodic', 'procedural'] as const)[i]!}
                excerpt=""
                highlights={[
                  [
                    { type: 'text', value: 'Timed out while checking out a connection from ' },
                    { type: 'hit', value: 'connection pool' },
                    { type: 'text', value: ' with maxPoolSize=10, waitQueueTimeoutMS=2000 after the API ' },
                    { type: 'hit', value: 'timeout' },
                    { type: 'text', value: ' alarms fired.' },
                  ],
                ]}
                verification={i === 2 ? 'verified_success' : 'unverified'}
                isSeed
                score={[7.31, 5.12, 4.4][i]!}
                scoreKind="search"
                columnMax={7.31}
                barClass="bg-mode-keyword"
                checked={Boolean(checked[id])}
                onCheckedChange={(c) => setChecked((s) => ({ ...s, [id]: c }))}
                selected={i === 0}
                active={hover === id}
                dimmed={hover !== null && hover !== id}
                onHoverChange={(h) => setHover(h ? id : null)}
                rankChips={
                  <>
                    <Badge tone="keyword">K{i + 1}</Badge>
                    <Badge tone="semantic">S{3 - i}</Badge>
                  </>
                }
              />
            ))}
            <ResultRowSkeleton />
          </Panel>
          <Panel title="Why this result" meta="hybrid · rank 1">
            <dl className="tabular grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-dense">
              <dt className="text-text-muted">Keyword rank</dt>
              <dd className="text-mode-keyword">3 · search 4.40</dd>
              <dt className="text-text-muted">Semantic rank</dt>
              <dd className="text-mode-semantic">3 · vector 0.842</dd>
              <dt className="text-text-muted">RRF</dt>
              <dd>0.0323</dd>
              <dt className="text-text-muted">Final</dt>
              <dd>0.0371 (verified ×1.15)</dd>
            </dl>
          </Panel>
        </div>
      </Section>

      <Section title="Data table" id="table">
        <Panel title="Memories" meta="4 rows" flush>
          <DataTable columns={columns} rows={FIXTURE_ROWS} rowKey={(r) => r.id} onRowClick={() => setDrawer(true)} activeKey="b" />
        </Panel>
        <Panel title="Loading" flush>
          <TableRowsSkeleton rows={3} cols={4} />
        </Panel>
      </Section>

      <Section title="Overlays" id="overlays">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDrawer(true)}>Open drawer</Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button>Open dialog</Button>
            </DialogTrigger>
            <DialogContent
              title="Create memory"
              description="Memories are embedded on save and become searchable shortly after."
              footer={
                <>
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button variant="primary">Create memory</Button>
                </>
              }
            >
              <Field label="Title" htmlFor="dlg-title">
                <Input id="dlg-title" />
              </Field>
            </DialogContent>
          </Dialog>
          <Popover>
            <PopoverTrigger asChild>
              <Button>Open popover</Button>
            </PopoverTrigger>
            <PopoverContent align="start">
              <p className="text-dense text-text-muted">Popovers sit on surface-overlay with the overlay shadow.</p>
            </PopoverContent>
          </Popover>
          <Tooltip content="final = rrf × (1 + 0.15·s), s = +1 verified success, −1 verified failure">
            <Button>Hover for tooltip</Button>
          </Tooltip>
          <Button onClick={() => toast.success('Memory archived')}>Show toast</Button>
          <Button onClick={() => toast.error('Vector index not found. Run npm run setup:indexes, then refresh.')}>
            Show error toast
          </Button>
        </div>
        <Drawer
          open={drawer}
          onOpenChange={setDrawer}
          title="Raise maxPoolSize and close cursors"
          description="Engineering Assistant · procedural"
          headerExtra={
            <div className="flex gap-1.5">
              <MemoryTypeBadge type="procedural" />
              <VerificationBadge status="verified_success" />
              <DemoDataBadge />
            </div>
          }
          footer={
            <>
              <Button variant="destructive">Archive memory</Button>
              <Button variant="primary">Save changes</Button>
            </>
          }
        >
          <p className="max-w-prose text-body text-text-muted">The drawer is 560px, focus-trapped, and closes with Esc.</p>
        </Drawer>
      </Section>

      <Section title="States" id="states">
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Empty">
            <EmptyState
              icon={Inbox}
              message="No memories yet. Create one or load the demo data."
              action={
                <Button size="sm" variant="primary">
                  <Plus aria-hidden />
                  Create memory
                </Button>
              }
            />
          </Panel>
          <Panel title="Error">
            <ErrorState
              title="Vector index not found."
              fix="Run npm run setup:indexes, then refresh."
              code="index_missing: memories_vector"
              onRetry={() => toast('Retrying')}
            />
          </Panel>
          <Panel title="Loading">
            <div className="grid gap-3">
              <MetricTileSkeleton />
            </div>
          </Panel>
        </div>
      </Section>

      <Section title="Timeline" id="timeline">
        <Panel title="Diagnose connection-pool incident" meta="attempt 2 · worker-b7f2">
          <Timeline
            items={[
              { id: '0', icon: <CheckCircle2 />, tone: 'success', title: 'Collect symptoms', meta: '12:01:04 · worker-a19c' },
              { id: '1', icon: <CheckCircle2 />, tone: 'success', title: 'Retrieve similar incidents', meta: '12:01:08 · worker-a19c' },
              {
                id: 'crash',
                icon: <Server />,
                tone: 'warning',
                title: 'Worker crashed — resumed from step 3 by worker-b7f2',
                meta: '12:01:27',
                body: 'Steps 1–2 were restored from checkpoints and not re-executed.',
                marker: true,
              },
              { id: '2', icon: <CheckCircle2 />, tone: 'success', title: 'Match the verified procedure', meta: '12:01:31 · worker-b7f2' },
              { id: '3', icon: <CircleDot />, tone: 'accent', title: 'Draft remediation', meta: 'running' },
              { id: '4', icon: <Database />, tone: 'neutral', title: 'Summarize', meta: 'pending' },
            ]}
          />
        </Panel>
      </Section>

      <Section title="Audio player" id="audio">
        <div className="flex flex-wrap items-center gap-6">
          <AudioPlayer
            generate={async () => {
              throw new Error('Demo: generation is not wired on this page');
            }}
          />
          <AudioPlayer generate={async () => new Blob()} disabledReason="ElevenLabs is not configured. Add a key in Settings." />
        </div>
      </Section>

      <Section title="Chart styling" id="charts">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Created vs retrieved">
            <div className="h-48">
              <ResponsiveContainer>
                <LineChart data={CHART_FIXTURE} margin={{ left: -16, right: 8, top: 8 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="d" {...axisProps} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <RTooltip content={<ChartTooltip />} cursor={{ stroke: tokenColor('border-strong') }} />
                  <Line dataKey="created" name="Created" stroke={tokenColor('accent')} strokeWidth={2} dot={false} />
                  <Line dataKey="retrieved" name="Retrieved" stroke={tokenColor('accent-2')} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="By type">
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart
                  layout="vertical"
                  data={MEMORY_TYPES.map((t, i) => ({ type: TYPE_META[t].label, n: [7, 9, 3, 6][i] }))}
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid {...gridProps} horizontal={false} vertical />
                  <XAxis type="number" {...axisProps} allowDecimals={false} />
                  <YAxis type="category" dataKey="type" {...axisProps} width={80} />
                  <RTooltip content={<ChartTooltip />} cursor={{ fill: tokenColor('surface-raised') }} />
                  <Bar dataKey="n" name="Memories" radius={[0, 4, 4, 0]} barSize={14}>
                    {MEMORY_TYPES.map((t) => (
                      <Cell key={t} fill={tokenColor(TYPE_META[t].token)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </Section>
    </div>
  );
}
